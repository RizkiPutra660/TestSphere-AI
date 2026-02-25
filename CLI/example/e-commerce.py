from datetime import datetime, timedelta
from typing import List, Dict, Optional
import uuid

# ========== FOUNDATION CLASSES ==========
class User:
    def __init__(self, user_id: str, name: str, email: str):
        self.user_id = user_id
        self.name = name
        self.email = email
        self.registration_date = datetime.now()
        self.order_history = []
    
    def place_order(self, cart) -> 'Order':
        order = Order(order_id=str(uuid.uuid4())[:8], user=self, items=cart.items)
        self.order_history.append(order)
        return order
    
    def get_order_count(self) -> int:
        return len(self.order_history)

class Product:
    def __init__(self, product_id: str, name: str, price: float, category: str):
        self.product_id = product_id
        self.name = name
        self.price = price
        self.category = category
        self.inventory = 0
        self.reviews = []
    
    def add_to_inventory(self, quantity: int):
        self.inventory += quantity
    
    def add_review(self, review: 'Review'):
        self.reviews.append(review)

class Category:
    def __init__(self, category_id: str, name: str, description: str):
        self.category_id = category_id
        self.name = name
        self.description = description
        self.products = []
    
    def add_product(self, product: Product):
        self.products.append(product)
        product.category = self.name

# ========== SHOPPING CLASSES ==========
class Cart:
    def __init__(self, user: User):
        self.cart_id = str(uuid.uuid4())[:8]
        self.user = user
        self.items = []  # List of CartItem objects
        self.created_at = datetime.now()
    
    def add_item(self, product: Product, quantity: int):
        # Check if product already in cart
        for item in self.items:
            if item.product.product_id == product.product_id:
                item.quantity += quantity
                return
        
        # Add new item
        cart_item = CartItem(product, quantity)
        self.items.append(cart_item)
    
    def get_total(self) -> float:
        return sum(item.get_subtotal() for item in self.items)
    
    def clear(self):
        self.items = []

class CartItem:
    def __init__(self, product: Product, quantity: int):
        self.product = product
        self.quantity = quantity
    
    def get_subtotal(self) -> float:
        return self.product.price * self.quantity

class Order:
    def __init__(self, order_id: str, user: User, items: List[CartItem]):
        self.order_id = order_id
        self.user = user
        self.items = items.copy()  # Copy from cart
        self.order_date = datetime.now()
        self.status = "Pending"
        self.shipping_address = None
        self.payment = None
        self.shipment = None
    
    def calculate_total(self) -> float:
        return sum(item.get_subtotal() for item in self.items)
    
    def set_shipping_address(self, address: 'Address'):
        self.shipping_address = address
    
    def set_payment(self, payment: 'Payment'):
        self.payment = payment
        self.status = "Paid"
    
    def set_shipment(self, shipment: 'Shipment'):
        self.shipment = shipment
        self.status = "Shipped"

# ========== PAYMENT & SHIPPING CLASSES ==========
class Payment:
    def __init__(self, payment_id: str, order: Order, amount: float, method: str):
        self.payment_id = payment_id
        self.order = order
        self.amount = amount
        self.method = method
        self.payment_date = datetime.now()
        self.status = "Completed"
    
    def process(self) -> bool:
        # Simulate payment processing
        if self.amount <= 0:
            return False
        self.status = "Completed"
        return True

class Address:
    def __init__(self, street: str, city: str, state: str, zip_code: str, country: str):
        self.address_id = str(uuid.uuid4())[:8]
        self.street = street
        self.city = city
        self.state = state
        self.zip_code = zip_code
        self.country = country
    
    def get_full_address(self) -> str:
        return f"{self.street}, {self.city}, {self.state} {self.zip_code}, {self.country}"

class Warehouse:
    def __init__(self, warehouse_id: str, name: str, location: Address):
        self.warehouse_id = warehouse_id
        self.name = name
        self.location = location
        self.inventory = {}  # product_id -> quantity
    
    def add_product(self, product: Product, quantity: int):
        self.inventory[product.product_id] = self.inventory.get(product.product_id, 0) + quantity
        product.add_to_inventory(quantity)
    
    def check_availability(self, product_id: str, quantity: int) -> bool:
        return self.inventory.get(product_id, 0) >= quantity

class Shipment:
    def __init__(self, shipment_id: str, order: Order, warehouse: Warehouse):
        self.shipment_id = shipment_id
        self.order = order
        self.warehouse = warehouse
        self.shipping_date = datetime.now()
        self.estimated_delivery = self.shipping_date + timedelta(days=3)
        self.tracking_number = str(uuid.uuid4())[:12].upper()
        self.status = "Preparing"
    
    def ship(self):
        # Check inventory for all items
        for item in self.order.items:
            if not self.warehouse.check_availability(item.product.product_id, item.quantity):
                raise Exception(f"Insufficient inventory for {item.product.name}")
        
        self.status = "Shipped"
        self.order.set_shipment(self)
    
    def get_tracking_info(self) -> str:
        return f"Tracking #{self.tracking_number} - Status: {self.status}"

# ========== REVIEW & SUPPORT CLASSES ==========
class Review:
    def __init__(self, review_id: str, user: User, product: Product, rating: int, comment: str):
        self.review_id = review_id
        self.user = user
        self.product = product
        self.rating = max(1, min(5, rating))  # Clamp between 1-5
        self.comment = comment
        self.date = datetime.now()
        
        # Connect review to product
        product.add_review(self)
    
    def get_summary(self) -> str:
        return f"{self.user.name} rated {self.product.name}: {self.rating}/5"

class CustomerServiceTicket:
    def __init__(self, ticket_id: str, user: User, order: Order, issue: str):
        self.ticket_id = ticket_id
        self.user = user
        self.order = order
        self.issue = issue
        self.created_date = datetime.now()
        self.status = "Open"
        self.resolution = None
    
    def resolve(self, resolution: str, resolved_by: 'Employee'):
        self.status = "Resolved"
        self.resolution = resolution
        self.resolved_by = resolved_by
        self.resolved_date = datetime.now()

class Employee:
    def __init__(self, employee_id: str, name: str, department: str):
        self.employee_id = employee_id
        self.name = name
        self.department = department
        self.tickets_resolved = 0
    
    def resolve_ticket(self, ticket: CustomerServiceTicket, resolution: str):
        ticket.resolve(resolution, self)
        self.tickets_resolved += 1

# ========== ANALYTICS CLASS ==========
class Analytics:
    def __init__(self):
        self.sales_data = []
    
    def record_sale(self, order: Order):
        self.sales_data.append({
            'order_id': order.order_id,
            'date': order.order_date,
            'total': order.calculate_total(),
            'user_id': order.user.user_id
        })
    
    def get_total_revenue(self) -> float:
        return sum(item['total'] for item in self.sales_data)
    
    def get_average_order_value(self) -> float:
        if not self.sales_data:
            return 0
        return self.get_total_revenue() / len(self.sales_data)

# ========== DEMONSTRATION ==========
def demonstrate_connected_system():
    """Show how all 15 classes work together"""
    print("=== E-COMMERCE PLATFORM SIMULATION ===\n")
    
    # 1. Create foundation objects
    user = User("U1001", "Alice Johnson", "alice@email.com")
    electronics = Category("CAT001", "Electronics", "Electronic devices and accessories")
    
    # 2. Create products
    laptop = Product("P1001", "Gaming Laptop", 1299.99, "Electronics")
    mouse = Product("P1002", "Wireless Mouse", 49.99, "Electronics")
    
    # 3. Connect category and products
    electronics.add_product(laptop)
    electronics.add_product(mouse)
    
    # 4. Create warehouse and add inventory
    warehouse_address = Address("123 Tech St", "San Francisco", "CA", "94107", "USA")
    main_warehouse = Warehouse("W001", "West Coast Warehouse", warehouse_address)
    main_warehouse.add_product(laptop, 50)
    main_warehouse.add_product(mouse, 200)
    
    # 5. User shops
    cart = Cart(user)
    cart.add_item(laptop, 1)
    cart.add_item(mouse, 2)
    
    print(f"1. {user.name} created cart with {len(cart.items)} items")
    print(f"   Cart total: ${cart.get_total():.2f}")
    
    # 6. Place order
    order = user.place_order(cart)
    shipping_address = Address("456 Home Ave", "San Jose", "CA", "95123", "USA")
    order.set_shipping_address(shipping_address)
    
    print(f"\n2. Order #{order.order_id} placed")
    print(f"   Order total: ${order.calculate_total():.2f}")
    
    # 7. Process payment
    payment = Payment("PAY001", order, order.calculate_total(), "Credit Card")
    payment.process()
    order.set_payment(payment)
    
    print(f"\n3. Payment processed via {payment.method}")
    print(f"   Payment status: {payment.status}")
    
    # 8. Create shipment
    shipment = Shipment("SHIP001", order, main_warehouse)
    shipment.ship()
    
    print(f"\n4. Shipment created")
    print(f"   Tracking: {shipment.tracking_number}")
    print(f"   Estimated delivery: {shipment.estimated_delivery.strftime('%Y-%m-%d')}")
    
    # 9. Add review
    review = Review("REV001", user, laptop, 5, "Excellent gaming performance!")
    
    print(f"\n5. Review added for {laptop.name}")
    print(f"   {review.get_summary()}")
    
    # 10. Create support ticket (simulate an issue)
    employee = Employee("E001", "Bob Smith", "Customer Service")
    ticket = CustomerServiceTicket("TKT001", user, order, "Delivery delay inquiry")
    employee.resolve_ticket(ticket, "Delivery is on schedule, will arrive tomorrow.")
    
    print(f"\n6. Support ticket resolved")
    print(f"   Issue: {ticket.issue}")
    print(f"   Resolved by: {employee.name} from {employee.department}")
    
    # 11. Analytics
    analytics = Analytics()
    analytics.record_sale(order)
    
    print(f"\n7. Analytics recorded")
    print(f"   Total revenue: ${analytics.get_total_revenue():.2f}")
    print(f"   Avg order value: ${analytics.get_average_order_value():.2f}")
    
    # Summary
    print(f"\n=== SYSTEM SUMMARY ===")
    print(f"• User placed {user.get_order_count()} order(s)")
    print(f"• Warehouse has {len(main_warehouse.inventory)} product types")
    print(f"• Category '{electronics.name}' has {len(electronics.products)} products")
    print(f"• Product '{laptop.name}' has {len(laptop.reviews)} review(s)")
    print(f"• Employee resolved {employee.tickets_resolved} ticket(s)")
    
    return {
        'user': user,
        'order': order,
        'shipment': shipment,
        'analytics': analytics
    }

if __name__ == "__main__":
    demonstrate_connected_system()