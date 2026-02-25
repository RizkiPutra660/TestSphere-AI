"""Book module for library management system"""


class Book:
    """Represents a book in the library"""
    
    def __init__(self, book_id: str, title: str, author: str, isbn: str):
        self.book_id = book_id
        self.title = title
        self.author = author
        self.isbn = isbn
        self.is_available = True
        self.borrowed_by = None
    
    def borrow(self) -> bool:
        """Mark book as borrowed"""
        if self.is_available:
            self.is_available = False
            return True
        return False
    
    def return_book(self) -> bool:
        """Mark book as returned"""
        if not self.is_available:
            self.is_available = True
            self.borrowed_by = None
            return True
        return False
    
    def get_status(self) -> str:
        """Get current status of the book"""
        return "Available" if self.is_available else "Borrowed"
