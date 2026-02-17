import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useUser, useAuth } from "@clerk/clerk-react";
import { courseHistoryEntry } from "../config";
import { authHeaders } from "../utils/api";

export default function CourseHistoryDetail() {
  const { id } = useParams();
  const { user } = useUser();
  const { getToken } = useAuth();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user || !id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function fetchOne() {
      try {
        const token = await getToken();
        const res = await fetch(courseHistoryEntry(id), { headers: authHeaders(token) });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (!cancelled) setCourse(data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchOne();
    return () => { cancelled = true; };
    // getToken from Clerk is stable; exhaustive-deps can still warn
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  if (!user) {
    return (
      <div className="min-h-full p-6 sm:p-12">
        <p className="text-gray-300">Sign in to view this course.</p>
      </div>
    );
  }

  if (loading) return <div className="min-h-full p-6 sm:p-12 text-gray-400">Loading…</div>;
  if (error) {
    return (
      <div className="min-h-full p-6 sm:p-12">
        <p className="text-red-400">{error}</p>
        <Link to="/course-history" className="text-purple-400 hover:underline mt-2 inline-block">Back to My Courses</Link>
      </div>
    );
  }
  if (!course) return null;

  const title = course.course_title || course.title || "Course";
  const modules = course.modules || [];
  const outcomes = course.learning_outcomes || course.outcomes || [];
  const labs = course.labs || course.lab_activities || [];
  const textbooks = course.textbooks || [];
  const references = course.online_references || [];

  return (
    <div className="min-h-full p-6 sm:p-12 max-w-4xl mx-auto">
      <Link to="/course-history" className="text-purple-400 hover:underline mb-4 inline-block">← My Courses</Link>
      <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
      {(course.credits || course.ltp || course.audience) && (
        <p className="text-gray-400 text-sm mb-6">
          {[course.credits && `Credits: ${course.credits}`, course.ltp && `L:T:P ${course.ltp}`, course.audience].filter(Boolean).join(" · ")}
        </p>
      )}

      <div className="space-y-8">
        {course.course_goals && (
          <section>
            <h2 className="text-xl font-semibold text-white mb-2">Course Goals</h2>
            <div className="bg-white/5 rounded-xl p-4 text-gray-300 whitespace-pre-wrap">{course.course_goals}</div>
          </section>
        )}
        {modules.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-white mb-2">Modules</h2>
            <ul className="space-y-3">
              {modules.map((m, i) => (
                <li key={i} className="bg-white/5 rounded-xl p-4">
                  <span className="font-medium text-white">Module {i + 1}: {m.title || m.name}</span>
                  {m.hours != null && <span className="text-gray-400 text-sm ml-2">({m.hours}h)</span>}
                  {m.description && <p className="text-gray-300 text-sm mt-1">{m.description}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {outcomes.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-white mb-2">Learning Outcomes</h2>
            <ul className="space-y-2">
              {outcomes.map((o, i) => (
                <li key={i} className="bg-white/5 rounded-xl p-4 text-gray-300">
                  {typeof o === "string" ? o : (o.text || o.outcome || o.description)}
                  {o.level && <span className="text-purple-400 text-sm ml-2">({o.level})</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {labs.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-white mb-2">Labs / Tutorials</h2>
            <ul className="space-y-2">
              {labs.map((l, i) => (
                <li key={i} className="bg-white/5 rounded-xl p-4 text-gray-300">
                  {typeof l === "string" ? l : (l.title || l.name || l.activity)}
                </li>
              ))}
            </ul>
          </section>
        )}
        {textbooks.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-white mb-2">Textbooks</h2>
            <ul className="space-y-2">
              {textbooks.map((t, i) => (
                <li key={i} className="text-gray-300">
                  {typeof t === "string" ? t : `${t.title || t.name}${t.author ? ` — ${t.author}` : ""}`}
                </li>
              ))}
            </ul>
          </section>
        )}
        {references.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-white mb-2">Online References</h2>
            <ul className="space-y-2">
              {references.map((r, i) => (
                <li key={i} className="text-gray-300">
                  {typeof r === "string" ? r : (r.title || r.url || r.name)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
