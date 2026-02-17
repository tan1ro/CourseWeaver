import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useUser, useAuth } from "@clerk/clerk-react";
import API_ENDPOINTS from "../config";
import { authHeaders } from "../utils/api";

export default function CourseHistory() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user || typeof getToken !== "function") {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function fetchHistory() {
      try {
        const token = await getToken();
        const res = await fetch(API_ENDPOINTS.COURSE_HISTORY, {
          headers: authHeaders(token),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (!cancelled) setList(Array.isArray(data) ? data : data.items || []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchHistory();
    return () => { cancelled = true; };
  }, [user, getToken]);

  if (!user) {
    return (
      <div className="min-h-full p-6 sm:p-12 max-w-4xl mx-auto">
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 text-center">
          <p className="text-gray-300">Sign in to see your generated course history.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-6 sm:p-12 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-6">My Generated Courses</h1>
      {loading && <p className="text-gray-400">Loading…</p>}
      {error && (
        <div className="text-red-400 bg-red-500/10 rounded-lg p-4 mb-6">{error}</div>
      )}
      {!loading && !error && list.length === 0 && (
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 text-center">
          <p className="text-gray-300 mb-4">No courses generated yet.</p>
          <Link
            to="/course-builder"
            className="inline-block px-6 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium"
          >
            Create your first course
          </Link>
        </div>
      )}
      {!loading && list.length > 0 && (
        <ul className="space-y-4">
          {list.map((entry) => (
            <li key={entry._id || entry.id}>
              <Link
                to={`/course-history/${entry._id || entry.id}`}
                className="block bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4 hover:bg-white/10 hover:border-purple-500/50 transition-all"
              >
                <h2 className="text-lg font-semibold text-white">
                  {entry.course_title || entry.title || "Untitled course"}
                </h2>
                <p className="text-gray-400 text-sm mt-1">
                  {entry.title && entry.title !== (entry.course_title || entry.title)
                    ? entry.title
                    : null}
                  {entry.audience ? ` · ${entry.audience}` : ""}
                </p>
                {entry.createdAt && (
                  <p className="text-gray-500 text-xs mt-2">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
