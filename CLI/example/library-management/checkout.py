"""Checkout module for managing book checkouts"""
from datetime import datetime, timedelta


class Checkout:
    """Manages book checkout operations between members and library"""
    
    def __init__(self, checkout_id: str, library):
        self.checkout_id = checkout_id
        self.library = library
        self.active_checkouts = {}
        self.checkout_history = []
    
    def checkout_book(self, member, book) -> bool:
        """Process book checkout for a member"""
        if not book.is_available:
            return False
        
        if book.borrow():
            member.add_borrowed_book(book)
            book.borrowed_by = member.member_id
            
            checkout_record = {
                'checkout_id': self.checkout_id,
                'member_id': member.member_id,
                'book_id': book.book_id,
                'checkout_date': datetime.now(),
                'due_date': datetime.now() + timedelta(days=14)
            }
            self.active_checkouts[book.book_id] = checkout_record
            self.checkout_history.append(checkout_record)
            return True
        
        return False
    
    def return_book(self, member, book) -> bool:
        """Process book return from a member"""
        if not member.has_book(book):
            return False
        
        if book.return_book():
            member.remove_borrowed_book(book)
            
            if book.book_id in self.active_checkouts:
                del self.active_checkouts[book.book_id]
            
            return True
        
        return False
    
    def get_active_checkouts_count(self) -> int:
        """Get count of active checkouts"""
        return len(self.active_checkouts)
    
    def get_total_history(self) -> int:
        """Get total checkout history records"""
        return len(self.checkout_history)
