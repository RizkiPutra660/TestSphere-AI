"""Library module for library management system"""


class Library:
    """Main library class that manages books and members"""
    
    def __init__(self, name: str, location: str):
        self.name = name
        self.location = location
        self.books = {}
        self.members = {}
    
    def add_book(self, book) -> bool:
        """Add a book to the library"""
        if book.book_id not in self.books:
            self.books[book.book_id] = book
            return True
        return False
    
    def add_member(self, member) -> bool:
        """Register a new member"""
        if member.member_id not in self.members:
            self.members[member.member_id] = member
            return True
        return False
    
    def get_available_books_count(self) -> int:
        """Get count of available books"""
        return sum(1 for book in self.books.values() if book.is_available)
    
    def get_total_books(self) -> int:
        """Get total books in library"""
        return len(self.books)
    
    def get_total_members(self) -> int:
        """Get total registered members"""
        return len(self.members)
    
    def find_book_by_title(self, title: str):
        """Find a book by title"""
        for book in self.books.values():
            if book.title.lower() == title.lower():
                return book
        return None
    
    def find_member(self, member_id: str):
        """Find a member by ID"""
        return self.members.get(member_id)
