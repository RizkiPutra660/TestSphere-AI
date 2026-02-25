"""
Pagination utilities for efficient data retrieval.

Provides:
- Pagination helpers for database queries
- Standardized pagination response format
- Offset and cursor-based pagination
"""

import logging
from math import ceil
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)


class Pagination:
    """
    Pagination helper for database queries.
    
    Supports offset-based pagination with standardized response format.
    """
    
    def __init__(self, page: int = 1, per_page: int = 20, max_per_page: int = 100):
        """
        Initialize pagination parameters.
        
        Args:
            page: Current page number (1-indexed)
            per_page: Items per page
            max_per_page: Maximum items per page (safety limit)
        """
        self.page = max(1, page)
        self.per_page = min(max(1, per_page), max_per_page)
        self.max_per_page = max_per_page
        
    @property
    def offset(self) -> int:
        """Calculate SQL OFFSET value."""
        return (self.page - 1) * self.per_page
    
    @property
    def limit(self) -> int:
        """Calculate SQL LIMIT value."""
        return self.per_page
    
    def paginate_query(self, cursor, query: str, params: tuple = None, count_query: str = None) -> Dict[str, Any]:
        """
        Execute paginated query and return standardized response.
        
        Args:
            cursor: Database cursor
            query: SQL SELECT query (will add LIMIT/OFFSET)
            params: Query parameters
            count_query: Optional COUNT query (if None, derives from query)
        
        Returns:
            dict: Paginated response with data, metadata, and links
        """
        # Get total count
        if count_query is None:
            # Derive count query from SELECT query
            count_query = self._derive_count_query(query)
        
        if params:
            cursor.execute(count_query, params)
        else:
            cursor.execute(count_query)
        
        total_items = cursor.fetchone()[0]
        total_pages = ceil(total_items / self.per_page) if total_items > 0 else 0
        
        # Get paginated data
        paginated_query = f"{query} LIMIT %s OFFSET %s"
        paginated_params = tuple(params) + (self.per_page, self.offset) if params else (self.per_page, self.offset)
        
        cursor.execute(paginated_query, paginated_params)
        
        # Fetch results
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        data = [dict(zip(columns, row)) for row in rows]
        
        # Build response
        return self.build_response(data, total_items, total_pages)
    
    def paginate_list(self, items: List[Any], total_items: int = None) -> Dict[str, Any]:
        """
        Paginate an in-memory list.
        
        Args:
            items: List of items (should already be sliced if coming from DB)
            total_items: Total count (if None, uses len(items))
        
        Returns:
            dict: Paginated response
        """
        if total_items is None:
            total_items = len(items)
        
        total_pages = ceil(total_items / self.per_page) if total_items > 0 else 0
        
        return self.build_response(items, total_items, total_pages)
    
    def build_response(self, data: List[Any], total_items: int, total_pages: int) -> Dict[str, Any]:
        """
        Build standardized pagination response.
        
        Args:
            data: List of items for current page
            total_items: Total number of items across all pages
            total_pages: Total number of pages
        
        Returns:
            dict: Pagination response with data and metadata
        """
        has_prev = self.page > 1
        has_next = self.page < total_pages
        
        return {
            'data': data,
            'pagination': {
                'page': self.page,
                'per_page': self.per_page,
                'total_items': total_items,
                'total_pages': total_pages,
                'has_prev': has_prev,
                'has_next': has_next,
            },
            'links': {
                'self': self.page,
                'first': 1,
                'last': total_pages if total_pages > 0 else 1,
                'prev': self.page - 1 if has_prev else None,
                'next': self.page + 1 if has_next else None,
            }
        }
    
    def _derive_count_query(self, query: str) -> str:
        """
        Derive COUNT query from SELECT query.
        
        Simple implementation that replaces SELECT clause with COUNT(*).
        May not work for all complex queries.
        """
        query_upper = query.upper()
        
        # Find FROM clause
        from_idx = query_upper.find(' FROM ')
        if from_idx == -1:
            raise ValueError("Invalid query: FROM clause not found")
        
        # Find end of query (before ORDER BY, LIMIT, etc.)
        order_idx = query_upper.find(' ORDER BY ')
        limit_idx = query_upper.find(' LIMIT ')
        
        end_idx = len(query)
        if order_idx != -1:
            end_idx = min(end_idx, order_idx)
        if limit_idx != -1:
            end_idx = min(end_idx, limit_idx)
        
        # Build count query
        count_query = f"SELECT COUNT(*) {query[from_idx:end_idx]}"
        return count_query


def get_pagination_params(request_args: Dict[str, Any], default_per_page: int = 20, max_per_page: int = 100) -> Pagination:
    """
    Extract pagination parameters from Flask request.args.
    
    Args:
        request_args: Flask request.args dict
        default_per_page: Default items per page
        max_per_page: Maximum items per page
    
    Returns:
        Pagination: Pagination helper instance
    
    Usage:
        from flask import request
        
        @app.route('/api/items')
        def get_items():
            pagination = get_pagination_params(request.args)
            result = pagination.paginate_query(cursor, "SELECT * FROM items")
            return jsonify(result)
    """
    try:
        page = int(request_args.get('page', 1))
    except (ValueError, TypeError):
        page = 1
    
    try:
        per_page = int(request_args.get('per_page', default_per_page))
    except (ValueError, TypeError):
        per_page = default_per_page
    
    return Pagination(page=page, per_page=per_page, max_per_page=max_per_page)


class CursorPagination:
    """
    Cursor-based pagination for efficient large dataset traversal.
    
    Better for real-time data and avoids issues with offset-based pagination
    when data changes between requests.
    """
    
    def __init__(self, cursor_field: str = 'id', limit: int = 20, max_limit: int = 100):
        """
        Initialize cursor pagination.
        
        Args:
            cursor_field: Field to use as cursor (must be unique and sortable)
            limit: Items per page
            max_limit: Maximum items per page
        """
        self.cursor_field = cursor_field
        self.limit = min(max(1, limit), max_limit)
        self.max_limit = max_limit
    
    def paginate_query(
        self, 
        cursor, 
        query: str, 
        params: tuple = None,
        cursor_value: Optional[Any] = None,
        direction: str = 'next'
    ) -> Dict[str, Any]:
        """
        Execute cursor-based paginated query.
        
        Args:
            cursor: Database cursor
            query: Base SQL query (without cursor filter)
            params: Query parameters
            cursor_value: Current cursor value (None for first page)
            direction: 'next' or 'prev'
        
        Returns:
            dict: Paginated response with cursor
        """
        # Build cursor condition
        if cursor_value is not None:
            if direction == 'next':
                cursor_condition = f"{self.cursor_field} > %s"
                order = f"ORDER BY {self.cursor_field} ASC"
            else:  # prev
                cursor_condition = f"{self.cursor_field} < %s"
                order = f"ORDER BY {self.cursor_field} DESC"
            
            # Add cursor condition to query
            if 'WHERE' in query.upper():
                query = f"{query} AND {cursor_condition}"
            else:
                query = f"{query} WHERE {cursor_condition}"
            
            # Add cursor value to params
            params = tuple(params) + (cursor_value,) if params else (cursor_value,)
        else:
            # First page
            order = f"ORDER BY {self.cursor_field} ASC"
        
        # Add ordering and limit
        paginated_query = f"{query} {order} LIMIT %s"
        paginated_params = tuple(params) + (self.limit + 1,) if params else (self.limit + 1,)
        
        cursor.execute(paginated_query, paginated_params)
        
        # Fetch results
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        data = [dict(zip(columns, row)) for row in rows]
        
        # Check if there are more results
        has_more = len(data) > self.limit
        if has_more:
            data = data[:self.limit]  # Remove extra item
        
        # Get next cursor
        next_cursor = data[-1][self.cursor_field] if data and has_more else None
        prev_cursor = data[0][self.cursor_field] if data else None
        
        return {
            'data': data,
            'pagination': {
                'limit': self.limit,
                'has_more': has_more,
            },
            'cursors': {
                'next': next_cursor,
                'prev': prev_cursor,
            }
        }


def apply_sorting(query: str, sort_by: str = None, order: str = 'asc', allowed_fields: List[str] = None) -> str:
    """
    Apply sorting to a query with validation.
    
    Args:
        query: SQL query
        sort_by: Field to sort by
        order: 'asc' or 'desc'
        allowed_fields: List of allowed sort fields (for security)
    
    Returns:
        str: Query with ORDER BY clause
    """
    if not sort_by:
        return query
    
    # Validate sort field
    if allowed_fields and sort_by not in allowed_fields:
        logger.warning(f"Invalid sort field: {sort_by}, ignoring")
        return query
    
    # Validate order
    order = order.lower()
    if order not in ['asc', 'desc']:
        order = 'asc'
    
    # Add ORDER BY
    if 'ORDER BY' not in query.upper():
        query = f"{query} ORDER BY {sort_by} {order.upper()}"
    
    return query


def apply_filters(base_query: str, params: List[Any], filters: Dict[str, Any], allowed_fields: List[str] = None) -> Tuple[str, List[Any]]:
    """
    Apply filters to a query with validation.
    
    Args:
        base_query: Base SQL query
        params: List of parameters
        filters: Dict of field:value filters
        allowed_fields: List of allowed filter fields
    
    Returns:
        tuple: (modified_query, modified_params)
    
    Usage:
        query = "SELECT * FROM projects"
        params = []
        filters = {'status': 'active', 'user_id': 123}
        query, params = apply_filters(query, params, filters, ['status', 'user_id'])
    """
    if not filters:
        return base_query, params
    
    conditions = []
    new_params = list(params)
    
    for field, value in filters.items():
        # Validate field
        if allowed_fields and field not in allowed_fields:
            logger.warning(f"Invalid filter field: {field}, ignoring")
            continue
        
        conditions.append(f"{field} = %s")
        new_params.append(value)
    
    if conditions:
        where_clause = ' AND '.join(conditions)
        if 'WHERE' in base_query.upper():
            base_query = f"{base_query} AND {where_clause}"
        else:
            base_query = f"{base_query} WHERE {where_clause}"
    
    return base_query, new_params
