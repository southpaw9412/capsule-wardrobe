# main.py
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional
import pandas as pd
from wardrobe_logic import generate_capsule

app = FastAPI()

class WardrobeRequest(BaseModel):
    height: Optional[str]
    weight: Optional[float]
    gender: str
    style_tags: List[str]
    budget_total: float
    excluded_fabrics: List[str]
    occasions: List[str]

@app.post("/generate_wardrobe")
def generate_wardrobe(req: WardrobeRequest):
    df = pd.read_csv("database.csv")
    capsule = generate_capsule(df, req.dict())
    return {"capsule": capsule}
