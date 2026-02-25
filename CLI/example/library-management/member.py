"""Member module for library management system"""
from datetime import datetime


class Member:
    """Represents a library member"""
    
    def __init__(self, member_id: str, name: str, email: str):
        self.member_id = member_id
        self.name = name
        self.email = email
        self.join_date = datetime.now()
        self.borrowed_books = []
        self.total_checkouts = 0
    
    def add_borrowed_book(self, book) -> bool:
        """Add a book to member's borrowed list"""
        if book not in self.borrowed_books:
            self.borrowed_books.append(book)
            self.total_checkouts += 1
            return True
        return False
    
    def remove_borrowed_book(self, book) -> bool:
        """Remove a book from member's borrowed list"""
        if book in self.borrowed_books:
            self.borrowed_books.remove(book)
            return True
        return False
    
    def get_borrowed_count(self) -> int:
        """Get count of currently borrowed books"""
        return len(self.borrowed_books)
    
    def has_book(self, book) -> bool:
        """Check if member has borrowed a specific book"""
        return book in self.borrowed_books
