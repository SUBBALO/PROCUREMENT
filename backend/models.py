"""Pydantic request/response models."""
from typing import List, Optional
from pydantic import BaseModel


# ---------------- Auth / Users ----------------
class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    name: Optional[str] = ""
    role: Optional[str] = "staff"  # 'admin' | 'staff' | 'store' | 'finance'
    perms: Optional[List[str]] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None
    password: Optional[str] = None
    perms: Optional[List[str]] = None


class UserOut(BaseModel):
    id: str
    username: str
    name: str
    role: str
    active: bool
    perms: List[str] = []


# ---------------- Transactions ----------------
class TransactionBase(BaseModel):
    invoice_date: str  # ISO date string YYYY-MM-DD
    project_no: Optional[str] = ""
    po_no: Optional[str] = ""
    vendor_name: str
    item_name: str
    qty: float
    unit: Optional[str] = "Ea"
    unit_price: float
    total_price: float
    invoice_no: Optional[str] = ""
    po_date: Optional[str] = None
    receive_date: Optional[str] = None
    notes: Optional[str] = ""
    is_compliant: Optional[bool] = True
    is_completed: Optional[bool] = True
    post_to_store: Optional[bool] = False


class TransactionCreate(TransactionBase):
    pass


class Transaction(TransactionBase):
    id: str
    created_at: str
    updated_at: str


class BulkCreateRequest(BaseModel):
    transactions: List[TransactionCreate]


# ---------------- Store ----------------
class StoreReceiveRequest(BaseModel):
    transaction_id: str
    do_number: Optional[str] = ""
    qty_received: float
    receive_date: str
    note: Optional[str] = ""


class StoreIssueRequest(BaseModel):
    item_name: str
    qty: float
    issue_date: str
    taker_name: str
    so_number: Optional[str] = ""
    note: Optional[str] = ""


class BulkReceiveItem(BaseModel):
    transaction_id: str
    qty_received: float
    note: Optional[str] = ""


class BulkReceiveRequest(BaseModel):
    do_number: Optional[str] = ""
    receive_date: str
    items: List[BulkReceiveItem]


class BulkIssueItem(BaseModel):
    item_name: str
    qty: float
    so_number: Optional[str] = ""
    taker_name: str
    issue_date: str
    note: Optional[str] = ""


class BulkIssueRequest(BaseModel):
    items: List[BulkIssueItem]


class StoreRequestCreate(BaseModel):
    target_type: str  # 'receipt' | 'issuance'
    target_id: str
    action_type: str  # 'edit' | 'delete'
    reason: str
    proposed_changes: Optional[dict] = None


class StoreRequestReview(BaseModel):
    approve: bool
    review_note: Optional[str] = ""


class ManualReceiveRequest(BaseModel):
    receive_date: str
    source_type: str  # 'customer' | 'supplier'
    source_name: str
    so_no: Optional[str] = ""
    do_no: Optional[str] = ""
    po_no: Optional[str] = ""
    item_name: str
    qty: float
    unit: Optional[str] = "Ea"
    mcl_done: Optional[bool] = False
    mif_done: Optional[bool] = False
    remark: Optional[str] = ""
    unit_price: Optional[float] = 0.0


class ProductionIssueItem(BaseModel):
    item_name: str
    qty: float
    so_number: Optional[str] = ""
    note: Optional[str] = ""


class ProductionIssueRequest(BaseModel):
    issue_date: str
    taker_name: str
    items: List[ProductionIssueItem]


# ---------------- Deliveries ----------------
class DeliveryItem(BaseModel):
    item_name: str
    qty: float
    unit: Optional[str] = "Ea"


class DeliveryCreate(BaseModel):
    delivery_date: str
    gate_pass_no: Optional[str] = ""
    do_no: Optional[str] = ""
    destination: str
    driver_name: Optional[str] = ""
    items: List[DeliveryItem]
    remark: Optional[str] = ""


# ---------------- Sales Orders ----------------
class SOCreate(BaseModel):
    so_no: str
    so_date: str
    customer: str
    description: Optional[str] = ""
