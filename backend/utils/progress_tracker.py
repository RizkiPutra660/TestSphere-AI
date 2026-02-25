"""
Server-Sent Events (SSE) implementation for real-time progress updates.

Provides real-time streaming of test execution progress to clients.
"""

from flask import Response, stream_with_context
import json
import time
from typing import Generator, Dict, Any, Optional
import queue
import threading
from dataclasses import dataclass, asdict
from datetime import datetime
from utils.logger import setup_logger

logger = setup_logger(__name__)


# Global registry of active SSE connections
_sse_connections: Dict[int, queue.Queue] = {}
_sse_lock = threading.Lock()


@dataclass
class ProgressEvent:
    """Progress event data structure."""
    event_type: str  # 'started', 'progress', 'completed', 'failed', 'cancelled'
    test_id: int
    progress: int  # 0-100
    message: str
    current_step: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    timestamp: Optional[str] = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow().isoformat()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {k: v for k, v in asdict(self).items() if v is not None}
    
    def to_sse_message(self) -> str:
        """Convert to SSE message format."""
        data = json.dumps(self.to_dict())
        return f"event: {self.event_type}\ndata: {data}\n\n"


def register_sse_client(test_id: int) -> queue.Queue:
    """
    Register a new SSE client for a test run.
    
    Args:
        test_id: Test ID to monitor
    
    Returns:
        Queue for receiving events
    """
    with _sse_lock:
        if test_id not in _sse_connections:
            _sse_connections[test_id] = queue.Queue()
        logger.info(f"SSE client registered for test {test_id}")
        return _sse_connections[test_id]


def unregister_sse_client(test_id: int):
    """
    Unregister an SSE client.
    
    Args:
        test_id: Test ID to stop monitoring
    """
    with _sse_lock:
        if test_id in _sse_connections:
            del _sse_connections[test_id]
            logger.info(f"SSE client unregistered for test {test_id}")


def send_progress_event(event: ProgressEvent):
    """
    Send a progress event to all connected SSE clients.
    
    Args:
        event: Progress event to send
    """
    test_id = event.test_id
    
    with _sse_lock:
        if test_id in _sse_connections:
            try:
                _sse_connections[test_id].put_nowait(event)
                logger.debug(f"Sent {event.event_type} event for test {test_id}: {event.message}")
            except queue.Full:
                logger.warning(f"Queue full for test {test_id}, event dropped")


def create_sse_stream(test_id: int) -> Response:
    """
    Create an SSE response stream for a test run.
    
    Args:
        test_id: Test ID to stream progress for
    
    Returns:
        Flask Response with SSE stream
    
    Usage:
        @app.route('/api/tests/<test_id>/progress')
        def test_progress(test_id):
            return create_sse_stream(test_id)
    """
    def generate() -> Generator[str, None, None]:
        """Generate SSE events."""
        event_queue = register_sse_client(test_id)
        
        try:
            # Send initial connection message
            yield "event: connected\ndata: {\"message\": \"Connected to progress stream\"}\n\n"
            
            # Keep connection alive with heartbeat
            last_heartbeat = time.time()
            
            while True:
                try:
                    # Get event from queue with timeout
                    event = event_queue.get(timeout=10)
                    
                    if event is None:  # Sentinel value to close connection
                        break
                    
                    # Send the event
                    yield event.to_sse_message()
                    
                    # Close connection on terminal events
                    if event.event_type in ['completed', 'failed', 'cancelled']:
                        break
                    
                except queue.Empty:
                    # Send heartbeat to keep connection alive
                    current_time = time.time()
                    if current_time - last_heartbeat > 30:
                        yield ": heartbeat\n\n"
                        last_heartbeat = current_time
        
        finally:
            unregister_sse_client(test_id)
    
    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',  # Disable nginx buffering
            'Connection': 'keep-alive'
        }
    )


class ProgressTracker:
    """
    Helper class to track and emit progress events.
    
    Usage:
        tracker = ProgressTracker(test_id=123)
        tracker.start("Generating tests...")
        tracker.update(25, "Analyzing code structure...")
        tracker.update(50, "Generating test cases...")
        tracker.update(75, "Optimizing tests...")
        tracker.complete("Tests generated successfully")
    """
    
    def __init__(self, test_id: int):
        self.test_id = test_id
        self.current_progress = 0
    
    def start(self, message: str = "Starting..."):
        """Mark test run as started."""
        event = ProgressEvent(
            event_type='started',
            test_id=self.test_id,
            progress=0,
            message=message
        )
        send_progress_event(event)
        self._persist_event(event)
        self.current_progress = 0
    
    def update(self, progress: int, message: str, current_step: Optional[str] = None, 
               metadata: Optional[Dict[str, Any]] = None):
        """
        Update progress.
        
        Args:
            progress: Progress percentage (0-100)
            message: Human-readable message
            current_step: Current step name
            metadata: Additional metadata
        """
        progress = max(0, min(100, progress))  # Clamp to 0-100
        
        event = ProgressEvent(
            event_type='progress',
            test_id=self.test_id,
            progress=progress,
            message=message,
            current_step=current_step,
            metadata=metadata
        )
        send_progress_event(event)
        self._persist_event(event)
        self.current_progress = progress
    
    def complete(self, message: str = "Completed successfully", 
                 metadata: Optional[Dict[str, Any]] = None):
        """Mark test run as completed."""
        event = ProgressEvent(
            event_type='completed',
            test_id=self.test_id,
            progress=100,
            message=message,
            metadata=metadata
        )
        send_progress_event(event)
        self._persist_event(event)
    
    def fail(self, message: str, error: Optional[str] = None):
        """Mark test run as failed."""
        metadata = {'error': error} if error else None
        event = ProgressEvent(
            event_type='failed',
            test_id=self.test_id,
            progress=self.current_progress,
            message=message,
            metadata=metadata
        )
        send_progress_event(event)
        self._persist_event(event)
    
    def cancel(self, message: str = "Cancelled by user"):
        """Mark test run as cancelled."""
        event = ProgressEvent(
            event_type='cancelled',
            test_id=self.test_id,
            progress=self.current_progress,
            message=message
        )
        send_progress_event(event)
        self._persist_event(event)
    
    def _persist_event(self, event: ProgressEvent):
        """
        Persist event to database for history.
        
        Args:
            event: Event to persist
        """
        try:
            import data.database as db
            conn = db.get_db_connection()
            cur = conn.cursor()
            
            # Insert event
            cur.execute("""
                INSERT INTO test_progress_events 
                (test_id, event_type, progress_percentage, message, metadata)
                VALUES (%s, %s, %s, %s, %s)
            """, (
                event.test_id,
                event.event_type,
                event.progress,
                event.message,
                json.dumps(event.metadata) if event.metadata else None
            ))
            
            # Update test record
            cur.execute("""
                UPDATE tests 
                SET progress_percentage = %s, 
                    current_step = %s,
                    started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
                    completed_at = CASE WHEN %s IN ('completed', 'failed', 'cancelled') 
                                   THEN CURRENT_TIMESTAMP ELSE completed_at END
                WHERE id = %s
            """, (event.progress, event.current_step, event.event_type, event.test_id))
            
            conn.commit()
            cur.close()
            db.return_db_connection(conn)
        except Exception as e:
            logger.error(f"Failed to persist progress event: {e}")


# WebSocket alternative (optional, commented out by default)
"""
from flask_socketio import SocketIO, emit, join_room, leave_room

socketio = SocketIO(cors_allowed_origins="*")

@socketio.on('subscribe_test')
def handle_subscribe(data):
    test_id = data.get('test_id')
    join_room(f'test_{test_id}')
    emit('subscribed', {'test_id': test_id})

@socketio.on('unsubscribe_test')
def handle_unsubscribe(data):
    test_id = data.get('test_id')
    leave_room(f'test_{test_id}')
    emit('unsubscribed', {'test_id': test_id})

def send_progress_websocket(event: ProgressEvent):
    socketio.emit('progress', event.to_dict(), room=f'test_{event.test_id}')
"""


def get_progress_history(test_id: int, limit: int = 50) -> list:
    """
    Get progress event history for a test run.
    
    Args:
        test_id: Test ID
        limit: Maximum number of events to return
    
    Returns:
        List of progress events
    """
    try:
        import data.database as db
        conn = db.get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT event_type, progress_percentage, message, metadata, created_at
            FROM test_progress_events
            WHERE test_id = %s
            ORDER BY created_at DESC
            LIMIT %s
        """, (test_id, limit))
        
        events = []
        for row in cur.fetchall():
            events.append({
                'event_type': row[0],
                'progress': row[1],
                'message': row[2],
                'metadata': row[3],
                'timestamp': row[4].isoformat() if row[4] else None
            })
        
        cur.close()
        db.return_db_connection(conn)
        
        return list(reversed(events))  # Return chronological order
    except Exception as e:
        logger.error(f"Failed to get progress history: {e}")
        return []
