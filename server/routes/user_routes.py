import os
import re
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from datetime import datetime
from bson import ObjectId
from pymongo import ReturnDocument

from auth import get_user_id
from database import get_users_collection, get_course_history_collection
from pymongo.errors import ServerSelectionTimeoutError, ConnectionFailure
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()


class ProfileUpdate(BaseModel):
    displayName: str | None = None
    bio: str | None = None
    title: str | None = None  # e.g. Professor, TA, Instructor
    department: str | None = None
    institution: str | None = None
    website: str | None = None
    logoFilename: str | None = None  # syllabus logo (stored under uploads/logos/)


def _serialize_doc(doc):
    if doc is None:
        return None
    d = dict(doc)
    oid = d.pop("_id", None)
    d["id"] = str(oid) if oid else None
    return d


@router.get("/me")
async def get_profile(user_id: str = Depends(get_user_id)):
    """Get or create user profile. Returns 404 if never created (client can PATCH to create)."""
    try:
        coll = get_users_collection()
        doc = coll.find_one({"clerkId": user_id})
        if doc:
            return _serialize_doc(doc)
        # Return minimal profile so client can show form and PATCH to create
        return {
            "id": None,
            "clerkId": user_id,
            "displayName": None,
            "bio": None,
            "title": None,
            "department": None,
            "institution": None,
            "website": None,
            "logoFilename": None,
        }
    except (ServerSelectionTimeoutError, ConnectionFailure) as e:
        logger.warning(f"Database error in get_profile: {e}")
        raise HTTPException(status_code=503, detail="Database unavailable")


@router.patch("/me")
async def update_profile(
    body: ProfileUpdate,
    user_id: str = Depends(get_user_id),
):
    """Create or update user profile."""
    try:
        coll = get_users_collection()
        update = {"updatedAt": datetime.utcnow()}
        if body.displayName is not None:
            update["displayName"] = body.displayName
        if body.bio is not None:
            update["bio"] = body.bio
        if body.title is not None:
            update["title"] = body.title
        if body.department is not None:
            update["department"] = body.department
        if body.institution is not None:
            update["institution"] = body.institution
        if body.website is not None:
            update["website"] = body.website
        if body.logoFilename is not None:
            update["logoFilename"] = body.logoFilename

        result = coll.find_one_and_update(
            {"clerkId": user_id},
            {
                "$set": update,
                "$setOnInsert": {"clerkId": user_id, "createdAt": datetime.utcnow()},
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        if result is None:
            result = coll.find_one({"clerkId": user_id})
        if not result:
            raise HTTPException(status_code=500, detail="Failed to save profile")
        return _serialize_doc(result)
    except HTTPException:
        raise
    except (ServerSelectionTimeoutError, ConnectionFailure) as e:
        logger.warning(f"Database error in update_profile: {e}")
        raise HTTPException(status_code=503, detail="Database unavailable")


LOGO_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "logos")
ALLOWED_LOGO_TYPES = {"image/png", "image/jpeg", "image/jpg"}


def _safe_logo_filename(user_id: str, original: str) -> str:
    """Generate a unique safe filename for logo (no path traversal)."""
    ext = os.path.splitext(original or "logo.png")[1].lower() or ".png"
    if ext not in (".png", ".jpg", ".jpeg"):
        ext = ".png"
    safe_id = re.sub(r"[^a-zA-Z0-9_-]", "", user_id.replace("|", "_"))[:32]
    return f"{safe_id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}{ext}"


@router.post("/upload-logo")
async def upload_logo(
    user_id: str = Depends(get_user_id),
    file: UploadFile = File(...),
):
    """
    Upload a syllabus logo. Saved under uploads/logos/ and profile.logoFilename updated.
    Accepts PNG/JPEG. Returns { "logoFilename": "..." } and profile is updated.
    """
    if file.content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(status_code=400, detail="Only PNG and JPEG images are allowed.")
    os.makedirs(LOGO_UPLOAD_DIR, exist_ok=True)
    filename = _safe_logo_filename(user_id, file.filename or "")
    filepath = os.path.join(LOGO_UPLOAD_DIR, filename)
    try:
        contents = await file.read()
        if len(contents) > 5 * 1024 * 1024:  # 5 MB
            raise HTTPException(status_code=400, detail="Logo must be under 5 MB.")
        with open(filepath, "wb") as f:
            f.write(contents)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Logo save failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to save logo.")
    # Store path relative to uploads/ so we can serve via /uploads/logos/filename
    stored_name = f"logos/{filename}"
    try:
        coll = get_users_collection()
        coll.find_one_and_update(
            {"clerkId": user_id},
            {"$set": {"logoFilename": stored_name, "updatedAt": datetime.utcnow()}},
            upsert=True,
        )
    except (ServerSelectionTimeoutError, ConnectionFailure) as e:
        logger.warning(f"Profile update after logo upload failed: {e}")
        raise HTTPException(status_code=503, detail="Database unavailable")
    return {"logoFilename": stored_name}


@router.get("/course-history")
async def list_course_history(user_id: str = Depends(get_user_id)):
    """List generated courses for the current user, newest first."""
    try:
        coll = get_course_history_collection()
        cursor = coll.find({"userId": user_id}).sort("createdAt", -1)
        items = list(cursor)
        return [_serialize_doc(d) for d in items]
    except (ServerSelectionTimeoutError, ConnectionFailure) as e:
        logger.warning(f"Database error in list_course_history: {e}")
        raise HTTPException(status_code=503, detail="Database unavailable")


@router.get("/course-history/{entry_id}")
async def get_course_history_entry(entry_id: str, user_id: str = Depends(get_user_id)):
    """Get a single generated course by id (must belong to current user)."""
    try:
        coll = get_course_history_collection()
        try:
            oid = ObjectId(entry_id)
        except Exception:
            raise HTTPException(status_code=404, detail="Not found")
        doc = coll.find_one({"_id": oid, "userId": user_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Not found")
        return _serialize_doc(doc)
    except HTTPException:
        raise
    except (ServerSelectionTimeoutError, ConnectionFailure) as e:
        logger.warning(f"Database error in get_course_history_entry: {e}")
        raise HTTPException(status_code=503, detail="Database unavailable")
