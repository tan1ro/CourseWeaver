import React, { useState, useRef, useEffect } from "react";
import jsPDF from "jspdf";
import { useAuth } from "@clerk/clerk-react";
import API_ENDPOINTS from "../config";
import { authHeaders } from "../utils/api";

// PDF layout constants (A4, mm)
const PDF_MARGIN = 20;
const PDF_PAGE_WIDTH = 210;
const PDF_PAGE_HEIGHT = 297;
const PDF_LINE_HEIGHT = 6;
const PDF_SECTION_GAP = 8;

/** Add text with word wrap; returns new y position. Optionally add new page if needed. */
function pdfAddWrappedText(pdf, text, x, y, maxWidth, fontSize = 11) {
  pdf.setFontSize(fontSize);
  const lines = pdf.splitTextToSize(text, maxWidth);
  for (const line of lines) {
    if (y > PDF_PAGE_HEIGHT - PDF_MARGIN) {
      pdf.addPage();
      y = PDF_MARGIN;
    }
    pdf.text(line, x, y);
    y += PDF_LINE_HEIGHT;
  }
  return y;
}

/** Ensure y is on current page; add new page if needed. Returns (pdf, newY). */
function pdfEnsureSpace(pdf, y, needLines = 5) {
  const bottom = PDF_PAGE_HEIGHT - PDF_MARGIN;
  if (y + needLines * PDF_LINE_HEIGHT > bottom) {
    pdf.addPage();
    return PDF_MARGIN;
  }
  return y;
}

const initialForm = {
  title: "",
  credits: "",
  ltp: "",
  audience: ""
};

export default function CourseBuilder() {
  const { getToken, isSignedIn } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState(null);
  const syllabusRef = useRef();

  // Load profile (for stored logo) when signed in
  useEffect(() => {
    if (!isSignedIn) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(API_ENDPOINTS.ME, { headers: authHeaders(token) });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setProfile(data);
        }
      } catch {
        if (!cancelled) setProfile(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isSignedIn, getToken]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const token = await getToken();
      const res = await fetch(API_ENDPOINTS.GENERATE_COURSE, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(form)
      });
      
      // Log the response for debugging
      console.log("Response status:", res.status);
      console.log("Response headers:", res.headers);
      
      if (!res.ok) {
        let errorMessage = `HTTP ${res.status}: ${res.statusText}`;
        try {
          const errorData = await res.json();
          console.log("Error response data:", errorData);
          errorMessage = errorData.detail || errorData.message || errorData.error || errorMessage;
        } catch (parseError) {
          console.log("Could not parse error response as JSON");
          const textError = await res.text();
          console.log("Error response text:", textError);
          errorMessage = textError || errorMessage;
        }
        throw new Error(errorMessage);
      }
      
      const data = await res.json();
      console.log("Success response data:", data);
      
      // Check if the response contains an error
      if (data.error) {
        throw new Error(data.error + (data.details ? `: ${data.details}` : ''));
      }
      
      setResult(data);
    } catch (err) {
      console.error("Error generating course:", err);
      console.error("Error details:", {
        message: err.message,
        stack: err.stack,
        form: form
      });
      setError(err.message || "Failed to generate course. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getLogoDataUrl = async () => {
    if (!profile?.logoFilename) return null;
    try {
      const res = await fetch(API_ENDPOINTS.UPLOAD_VIEW(profile.logoFilename));
      if (!res.ok) return null;
      const blob = await res.blob();
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const handleDownloadPDF = async () => {
    if (!result) return;

    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const contentWidth = PDF_PAGE_WIDTH - 2 * PDF_MARGIN;
    let y = PDF_MARGIN;

    // Logo at top (if set)
    const logoDataUrl = await getLogoDataUrl();
    if (logoDataUrl) {
      const logoW = 40;
      const logoH = 20;
      try {
        pdf.addImage(logoDataUrl, "PNG", PDF_MARGIN, y, logoW, logoH);
      } catch {
        // ignore if image format not supported
      }
      y += logoH + PDF_SECTION_GAP;
    }

    // Colors: professional document (dark text on white)
    const colorTitle = [60, 60, 80];
    const colorHeading = [40, 40, 60];
    const colorBody = [30, 30, 40];
    const colorMuted = [80, 80, 100];

    const setColor = (rgb) => pdf.setTextColor(...rgb);

    // --- Title ---
    pdf.setFontSize(22);
    setColor(colorTitle);
    const titleLines = pdf.splitTextToSize(result.course_title || "Course Syllabus", contentWidth);
    for (const line of titleLines) {
      pdf.text(line, PDF_MARGIN, y);
      y += PDF_LINE_HEIGHT + 2;
    }
    y += PDF_SECTION_GAP;

    // --- Meta (Duration, Audience) ---
    pdf.setFontSize(11);
    setColor(colorBody);
    y = pdfAddWrappedText(pdf, `Duration: ${result.duration || "—"}  |  Target Audience: ${result.target_audience || "—"}`, PDF_MARGIN, y, contentWidth);
    y += PDF_SECTION_GAP;

    // --- Course Goals ---
    y = pdfEnsureSpace(pdf, y, 8);
    pdf.setFontSize(14);
    setColor(colorHeading);
    pdf.text("Course Goals", PDF_MARGIN, y);
    y += PDF_LINE_HEIGHT + 2;
    pdf.setFontSize(10);
    setColor(colorBody);
    (result.course_goals || []).forEach((goal) => {
      y = pdfEnsureSpace(pdf, y, 3);
      y = pdfAddWrappedText(pdf, `• ${goal}`, PDF_MARGIN + 3, y, contentWidth - 3, 10);
      y += 2;
    });
    y += PDF_SECTION_GAP;

    // --- Tools & Technologies ---
    y = pdfEnsureSpace(pdf, y, 10);
    pdf.setFontSize(14);
    setColor(colorHeading);
    pdf.text("Tools & Technologies", PDF_MARGIN, y);
    y += PDF_LINE_HEIGHT + 2;
    const tools = result.tools_and_technologies || {};
    pdf.setFontSize(10);
    setColor(colorBody);
    y = pdfAddWrappedText(pdf, `Programming Language: ${tools.programming_language || "—"}`, PDF_MARGIN, y, contentWidth);
    y = pdfAddWrappedText(pdf, `Development Environment: ${tools.development_environment || "—"}`, PDF_MARGIN, y, contentWidth);
    if (tools.key_libraries?.length) {
      y = pdfAddWrappedText(pdf, `Key Libraries: ${tools.key_libraries.join(", ")}`, PDF_MARGIN, y, contentWidth);
    }
    y += PDF_SECTION_GAP;

    // --- Weekly Breakdown ---
    (result.weekly_breakdown || []).forEach((week) => {
      y = pdfEnsureSpace(pdf, y, 15);
      pdf.setFontSize(13);
      setColor(colorHeading);
      pdf.text(`Week ${week.week}: ${week.theme || ""}`, PDF_MARGIN, y);
      y += PDF_LINE_HEIGHT + 2;

      pdf.setFontSize(10);
      setColor(colorMuted);
      pdf.text("Learning Objectives", PDF_MARGIN + 2, y);
      y += PDF_LINE_HEIGHT;
      setColor(colorBody);
      (week.learning_objectives || []).forEach((obj) => {
        y = pdfEnsureSpace(pdf, y, 2);
        y = pdfAddWrappedText(pdf, `• ${obj}`, PDF_MARGIN + 4, y, contentWidth - 4, 10);
        y += 1;
      });
      y += 2;

      setColor(colorMuted);
      pdf.text("Daily Plan", PDF_MARGIN + 2, y);
      y += PDF_LINE_HEIGHT;
      setColor(colorBody);
      (week.daily_plan || []).forEach((day) => {
        y = pdfEnsureSpace(pdf, y, 5);
        const dayTitle = `Day ${day.day}: ${day.topic || ""}${day.hours != null ? ` (${day.hours} ${day.hours === 1 ? "hour" : "hours"})` : ""}`;
        pdf.setFont("helvetica", "bold");
        y = pdfAddWrappedText(pdf, dayTitle, PDF_MARGIN + 4, y, contentWidth - 4, 10);
        pdf.setFont("helvetica", "normal");
        y = pdfAddWrappedText(pdf, day.description || "", PDF_MARGIN + 6, y, contentWidth - 6, 9);
        y = pdfAddWrappedText(pdf, `Lab: ${day.lab || ""}`, PDF_MARGIN + 6, y, contentWidth - 6, 9);
        y += 3;
      });
      y += PDF_SECTION_GAP;
    });

    // --- Assessment ---
    y = pdfEnsureSpace(pdf, y, 8);
    pdf.setFontSize(14);
    setColor(colorHeading);
    pdf.text("Assessment", PDF_MARGIN, y);
    y += PDF_LINE_HEIGHT + 2;
    pdf.setFontSize(10);
    setColor(colorBody);
    (result.assessment?.details || []).forEach((item) => {
      y = pdfEnsureSpace(pdf, y, 1);
      pdf.text(`${item.type || ""}`, PDF_MARGIN, y);
      pdf.text(`${item.weight || ""}`, PDF_PAGE_WIDTH - PDF_MARGIN - pdf.getTextWidth(`${item.weight || ""}`), y);
      y += PDF_LINE_HEIGHT + 1;
    });
    y += PDF_SECTION_GAP;

    // --- Recommended Resources ---
    y = pdfEnsureSpace(pdf, y, 10);
    pdf.setFontSize(14);
    setColor(colorHeading);
    pdf.text("Recommended Resources", PDF_MARGIN, y);
    y += PDF_LINE_HEIGHT + 2;
    const res = result.recommended_resources || {};
    pdf.setFontSize(10);
    setColor(colorBody);
    if (res.books?.length) {
      pdf.setFont("helvetica", "bold");
      pdf.text("Books", PDF_MARGIN + 2, y);
      y += PDF_LINE_HEIGHT;
      pdf.setFont("helvetica", "normal");
      res.books.forEach((book) => {
        y = pdfAddWrappedText(pdf, `"${book.title || ""}" by ${book.author || ""}`, PDF_MARGIN + 4, y, contentWidth - 4, 10);
        y += 1;
      });
      y += 2;
    }
    if (res.online_platforms?.length) {
      pdf.setFont("helvetica", "bold");
      pdf.text("Online Platforms", PDF_MARGIN + 2, y);
      y += PDF_LINE_HEIGHT;
      pdf.setFont("helvetica", "normal");
      y = pdfAddWrappedText(pdf, res.online_platforms.join(", "), PDF_MARGIN + 4, y, contentWidth - 4, 10);
    }

    pdf.save(`syllabus-${(result.course_title || "syllabus").replace(/ /g, "_")}.pdf`);
  };

  const handleDownloadDOCX = async () => {
    if (!result) return;
    try {
      const token = await getToken();
      const payload = { ...result, credits: form.credits, ltp: form.ltp };
      if (profile?.logoFilename) payload.logoFilename = profile.logoFilename;
      const res = await fetch(API_ENDPOINTS.EXPORT_COURSE_DOCX, {
        method: "POST",
        headers: { ...authHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(res.statusText || "Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `syllabus-${(result.course_title || "syllabus").replace(/\s/g, "_")}.docx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("DOCX export failed:", err);
      setError(err.message || "Failed to download DOCX. Try again.");
    }
  };

  return (
    <div className="min-h-full p-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Course Builder
          </h1>
          <p className="text-gray-300 text-lg">Generate comprehensive course syllabi with AI assistance</p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">Course Title</label>
                <input 
                  name="title" 
                  value={form.title} 
                  onChange={handleChange} 
                  required 
                  placeholder="e.g. Introduction to Machine Learning" 
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300" 
                />
              </div>
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">Credits</label>
                <input 
                  name="credits" 
                  value={form.credits} 
                  onChange={handleChange} 
                  required 
                  placeholder="e.g. 3" 
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300" 
                />
              </div>
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">L:T:P Ratio</label>
                <input 
                  name="ltp" 
                  value={form.ltp} 
                  onChange={handleChange} 
                  required 
                  placeholder="e.g. 2:0:2" 
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300" 
                />
              </div>
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">Target Audience</label>
                <input 
                  name="audience" 
                  value={form.audience} 
                  onChange={handleChange} 
                  required 
                  placeholder="e.g. B.Tech CSE, M.Tech AI" 
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300" 
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:from-purple-700 hover:to-pink-700 transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none" 
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3"></div>
                  Generating Course...
                </div>
              ) : (
                "Generate Course"
              )}
            </button>
          </form>
        </div>

        {error && (
          <div className="mt-8 bg-red-500/20 border border-red-500/30 rounded-xl p-6 text-red-300">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          </div>
        )}

        {result && (
          <div className="mt-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-white flex items-center">
                <svg className="w-6 h-6 mr-3 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                </svg>
                Generated Syllabus
              </h3>
              <div className="flex gap-3">
                <button 
                  onClick={handleDownloadPDF} 
                  className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-green-700 hover:to-emerald-700 transform hover:scale-105 transition-all duration-300 flex items-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Download PDF
                </button>
                <button 
                  onClick={handleDownloadDOCX} 
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transform hover:scale-105 transition-all duration-300 flex items-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                  </svg>
                  Download DOCX (template)
                </button>
              </div>
            </div>
            
            <div ref={syllabusRef} className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 text-white">
              <h2 className="text-3xl font-bold mb-4 text-center bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                {result.course_title}
              </h2>
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <p className="bg-white/5 rounded-lg p-3">
                  <strong className="text-purple-300">Duration:</strong> {result.duration}
                </p>
                <p className="bg-white/5 rounded-lg p-3">
                  <strong className="text-purple-300">Target Audience:</strong> {result.target_audience}
                </p>
              </div>

              <div className="mb-6">
                <h4 className="font-semibold text-xl mb-3 text-purple-300 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Course Goals
                </h4>
                <div className="grid gap-2">
                  {result.course_goals?.map((goal, i) => (
                    <div key={i} className="bg-white/5 rounded-lg p-3 border-l-4 border-purple-500">
                      {goal}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <h4 className="font-semibold text-xl mb-3 text-pink-300 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                  </svg>
                  Tools & Technologies
                </h4>
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="mb-2"><strong className="text-purple-300">Programming Language:</strong> {result.tools_and_technologies?.programming_language}</p>
                  <p className="mb-3"><strong className="text-purple-300">Development Environment:</strong> {result.tools_and_technologies?.development_environment}</p>
                  <h5 className="font-semibold mb-2 text-pink-300">Key Libraries:</h5>
                  <div className="flex flex-wrap gap-2">
                    {result.tools_and_technologies?.key_libraries?.map((lib, i) => (
                      <span key={i} className="bg-purple-500/20 text-purple-300 px-3 py-1 rounded-full text-sm">
                        {lib}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h4 className="font-semibold text-xl mb-3 text-green-300 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                  Weekly Breakdown
                </h4>
                <div className="space-y-4">
                  {result.weekly_breakdown?.map((week, i) => (
                    <div key={i} className="bg-white/5 rounded-lg p-4 border-l-4 border-green-500">
                      <h5 className="font-bold text-lg mb-3 text-green-300">Week {week.week}: {week.theme}</h5>
                      <div className="ml-4 space-y-3">
                        <div>
                          <h6 className="font-semibold text-purple-300 mb-2">Learning Objectives:</h6>
                          <div className="grid gap-2">
                            {week.learning_objectives?.map((obj, j) => (
                              <div key={j} className="bg-white/5 rounded p-2 text-sm">
                                {obj}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h6 className="font-semibold text-pink-300 mb-2">Daily Plan:</h6>
                          <div className="space-y-2">
                            {week.daily_plan?.map((day, k) => (
                              <div key={k} className="bg-white/5 rounded p-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <strong className="text-white">Day {day.day}: {day.topic}</strong>
                                  {day.hours != null && (
                                    <span className="bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded text-sm font-medium">
                                      {day.hours} {day.hours === 1 ? 'hour' : 'hours'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-gray-300 text-sm mt-1">{day.description}</p>
                                <p className="text-purple-300 text-sm mt-1 italic">Lab: {day.lab}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <h4 className="font-semibold text-xl mb-3 text-yellow-300 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  Assessment
                </h4>
                <div className="grid gap-2">
                  {result.assessment?.details?.map((item, i) => (
                    <div key={i} className="bg-white/5 rounded-lg p-3 flex justify-between items-center">
                      <span className="text-purple-300 font-medium">{item.type}</span>
                      <span className="bg-yellow-500/20 text-yellow-300 px-3 py-1 rounded-full text-sm font-medium">
                        {item.weight}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <h4 className="font-semibold text-xl mb-3 text-blue-300 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Recommended Resources
                </h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white/5 rounded-lg p-4">
                    <h5 className="font-semibold mb-3 text-purple-300">Books:</h5>
                    <div className="space-y-2">
                      {result.recommended_resources?.books?.map((book, i) => (
                        <div key={i} className="bg-white/5 rounded p-2 text-sm">
                          "{book.title}" by {book.author}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4">
                    <h5 className="font-semibold mb-3 text-pink-300">Online Platforms:</h5>
                    <div className="space-y-2">
                      {result.recommended_resources?.online_platforms?.map((platform, i) => (
                        <div key={i} className="bg-white/5 rounded p-2 text-sm">
                          {platform}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 