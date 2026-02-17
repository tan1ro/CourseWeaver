// API Configuration
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export const API_ENDPOINTS = {
  GENERATE_COURSE: `${API_BASE_URL}/api/generate-course`,
  EXPORT_COURSE_DOCX: `${API_BASE_URL}/api/export-course-docx`,
  UPLOAD_VIEW: (filename) => `${API_BASE_URL}/uploads/${encodeURIComponent(filename)}`,
  CHECK_OUTCOME: `${API_BASE_URL}/api/check-outcome`,
  UPLOAD_SYLLABUS: `${API_BASE_URL}/api/upload-syllabus`,
  GET_BOOKS: `${API_BASE_URL}/api/get-books`,
  HEALTH: `${API_BASE_URL}/health`,
  // Auth & user
  ME: `${API_BASE_URL}/api/me`,
  COURSE_HISTORY: `${API_BASE_URL}/api/course-history`,
  UPLOAD_LOGO: `${API_BASE_URL}/api/upload-logo`,
};

export const courseHistoryEntry = (id) => `${API_BASE_URL}/api/course-history/${id}`;

export default API_ENDPOINTS; 