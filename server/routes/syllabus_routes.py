from fastapi import APIRouter, UploadFile, File, HTTPException
from services.gemini_service import analyze_syllabus_content
from database import get_syllabi_collection
import os
from docx import Document
from PyPDF2 import PdfReader
from pymongo.errors import ServerSelectionTimeoutError, ConnectionFailure

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def extract_text_from_docx(file_path):
    doc = Document(file_path)
    return "\n".join([para.text for para in doc.paragraphs])

def extract_text_from_pdf(file_path):
    reader = PdfReader(file_path)
    text = ""
    for page in reader.pages:
        text += page.extract_text() or ""
    return text

@router.post("/upload-syllabus")
async def upload_syllabus(file: UploadFile = File(...)):
    ext = file.filename.split(".")[-1].lower()
    if ext not in ["docx", "pdf"]:
        raise HTTPException(status_code=400, detail="Only .docx and .pdf files are supported.")
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as f:
        f.write(await file.read())
    # Extract text
    if ext == "docx":
        content = extract_text_from_docx(file_path)
    else:
        content = extract_text_from_pdf(file_path)
    # Analyze
    result = analyze_syllabus_content(content)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result)
    # Save to DB
    try:
        get_syllabi_collection().insert_one({"filename": file.filename, "analysis": result})
    except (ServerSelectionTimeoutError, ConnectionFailure) as e:
        # Log the error but don't fail the request - analysis is still returned
        print(f"⚠️ Warning: Failed to save to database: {e}")
        print("⚠️ Analysis result returned but not persisted to database")
    except Exception as e:
        # Log other database errors
        print(f"⚠️ Warning: Database error: {e}")
    return result 