"""
Structured logging configuration for the application.
Replaces print statements with proper logging.
"""
import logging
import sys
from datetime import datetime

# Configure logging format
LOG_FORMAT = '[%(asctime)s] %(levelname)s [%(name)s.%(funcName)s:%(lineno)d] %(message)s'
DATE_FORMAT = '%Y-%m-%d %H:%M:%S'

def setup_logger(name: str, level=logging.INFO):
    """
    Create a configured logger instance.
    
    Args:
        name: Logger name (typically __name__ from calling module)
        level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    
    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    
    # Only add handler if logger doesn't have one yet
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
        logger.addHandler(handler)
    
    logger.setLevel(level)
    return logger

def get_logger(name: str):
    """Get or create a logger with the given name."""
    return logging.getLogger(name)
