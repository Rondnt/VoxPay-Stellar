from typing import Literal

from pydantic import BaseModel, Field

IntentType = Literal["create_order", "get_order_status", "get_sales_summary", "unknown"]


class Split(BaseModel):
    recipient_alias: str
    amount: float = Field(gt=0)
    type: Literal["tip", "share"] = "share"


class Intent(BaseModel):
    intent: IntentType
    amount: float | None = Field(default=None, gt=0)
    asset: str | None = None
    order_ref: str | None = None
    splits: list[Split] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
