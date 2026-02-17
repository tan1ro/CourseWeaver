import os
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Body
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from services.gemini_service import generate_course_syllabus
from services.docx_template_service import fill_template
from database import get_courses_collection, get_course_history_collection
from auth import get_user_id_optional
from pymongo.errors import ServerSelectionTimeoutError, ConnectionFailure
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

class CourseInput(BaseModel):
    title: str
    credits: str
    ltp: str
    audience: str


def _resolve_logo_path(logo_filename: str | None) -> str | None:
    """Resolve logoFilename (e.g. 'logos/xxx.png') to absolute path under server/uploads."""
    if not logo_filename or ".." in logo_filename:
        return None
    base = os.path.join(os.path.dirname(__file__), "..")
    path = os.path.normpath(os.path.join(base, "uploads", logo_filename))
    if not path.startswith(os.path.abspath(os.path.join(base, "uploads"))):
        return None
    return path if os.path.isfile(path) else None


@router.post("/export-course-docx")
async def export_course_docx(course_data: dict = Body(...)):
    """
    Fill the syllabus template.docx with course builder data and return the DOCX file.
    Expects the same shape as generate-course response (plus optional credits, ltp, logoFilename).
    If logoFilename is set (e.g. from user profile), the logo is embedded at the top.
    """
    try:
        logo_path = _resolve_logo_path(course_data.get("logoFilename"))
        buffer = fill_template(course_data, logo_path=logo_path)
        title = (course_data.get("course_title") or course_data.get("title") or "syllabus").replace(" ", "_")
        filename = f"{title}.docx"
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except FileNotFoundError as e:
        logger.warning(str(e))
        raise HTTPException(status_code=503, detail="Syllabus template is not available.")
    except Exception as e:
        logger.exception("Export DOCX failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-course")
async def generate_course(
    course: CourseInput,
    user_id: str | None = Depends(get_user_id_optional),
):
    try:
        logger.info(f"Generating course: {course.title}")
        result = generate_course_syllabus(course.title, course.credits, course.ltp, course.audience)
        
        if "error" in result:
            logger.error(f"Course generation failed: {result['error']}")
            raise HTTPException(
                status_code=500, 
                detail={
                    "error": result["error"],
                    "details": result.get("details", "Unknown error occurred")
                }
            )
        
        payload = {**course.model_dump(), **result}
        # Save to global courses collection (existing behavior)
        try:
            get_courses_collection().insert_one(payload)
        except (ServerSelectionTimeoutError, ConnectionFailure) as db_error:
            logger.warning(f"Failed to save to database: {db_error}")
        except Exception as db_error:
            logger.warning(f"Database error: {db_error}")
        
        # If user is signed in, also save to their course history
        if user_id:
            try:
                get_course_history_collection().insert_one({
                    "userId": user_id,
                    "createdAt": datetime.utcnow(),
                    **payload,
                })
            except (ServerSelectionTimeoutError, ConnectionFailure) as db_error:
                logger.warning(f"Failed to save to course history: {db_error}")
            except Exception as db_error:
                logger.warning(f"Course history save error: {db_error}")
        
        logger.info(f"Successfully generated course: {course.title}")
        return result
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Unexpected error in generate_course: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Internal server error",
                "details": "An unexpected error occurred while generating the course"
            }
        ) 