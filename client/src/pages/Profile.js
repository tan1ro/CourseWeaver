import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useUser, useAuth } from "@clerk/clerk-react";
import API_ENDPOINTS from "../config";
import { authHeaders } from "../utils/api";

export default function Profile() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [edit, setEdit] = useState({
    displayName: "",
    bio: "",
    title: "",
    department: "",
    institution: "",
    website: "",
  });

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function fetchProfile() {
      try {
        const token = await getToken();
        const res = await fetch(API_ENDPOINTS.ME, {
          headers: authHeaders(token),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (!cancelled) {
          setProfile(data);
          setEdit({
            displayName: data.displayName ?? user.fullName ?? "",
            bio: data.bio ?? "",
            title: data.title ?? "",
            department: data.department ?? "",
            institution: data.institution ?? "",
            website: data.website ?? "",
          });
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchProfile();
    return () => { cancelled = true; };
    // getToken from Clerk is stable; exhaustive-deps can still warn
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(API_ENDPOINTS.ME, {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify({
          displayName: edit.displayName,
          bio: edit.bio,
          title: edit.title || null,
          department: edit.department || null,
          institution: edit.institution || null,
          website: edit.website || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setProfile(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.match(/^image\/(png|jpeg|jpg)$/)) {
      setError("Please choose a PNG or JPEG image.");
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result);
    reader.readAsDataURL(file);
    setError(null);
  };

  const handleSaveLogoAsDefault = async (e) => {
    e.preventDefault();
    if (!logoFile || !user) return;
    setLogoUploading(true);
    setError(null);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append("file", logoFile);
      const res = await fetch(API_ENDPOINTS.UPLOAD_LOGO, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Upload failed");
      }
      const data = await res.json();
      setProfile((p) => (p ? { ...p, logoFilename: data.logoFilename } : { logoFilename: data.logoFilename }));
      setLogoFile(null);
      setLogoPreview(null);
    } catch (e) {
      setError(e.message || "Failed to save logo.");
    } finally {
      setLogoUploading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-full p-6 sm:p-12 max-w-2xl mx-auto">
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 text-center">
          <p className="text-gray-300">Sign in to view and edit your profile.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-full p-6 sm:p-12 flex items-center justify-center">
        <div className="text-gray-400">Loading profile…</div>
      </div>
    );
  }

  const inputClass =
    "w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent";
  const labelClass = "block text-gray-400 text-sm mb-1";

  return (
    <div className="min-h-full p-6 sm:p-12 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">Profile</h1>
        <Link
          to="/course-history"
          className="text-purple-400 hover:text-purple-300 text-sm font-medium"
        >
          My Courses →
        </Link>
      </div>
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8">
        <div className="flex items-center gap-4 mb-8">
          <img
            src={user.imageUrl}
            alt=""
            className="w-20 h-20 rounded-full border-2 border-purple-500/50 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-gray-400 text-sm">Email</p>
            <p className="text-white truncate">{user.primaryEmailAddress?.emailAddress}</p>
            {profile?.updatedAt && (
              <p className="text-gray-500 text-xs mt-1">
                Updated {new Date(profile.updatedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div className="text-red-400 text-sm bg-red-500/10 rounded-lg p-3">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Display name</label>
              <input
                type="text"
                value={edit.displayName}
                onChange={(e) => setEdit((p) => ({ ...p, displayName: e.target.value }))}
                className={inputClass}
                placeholder="Your name"
              />
            </div>
            <div>
              <label className={labelClass}>Title</label>
              <input
                type="text"
                value={edit.title}
                onChange={(e) => setEdit((p) => ({ ...p, title: e.target.value }))}
                className={inputClass}
                placeholder="e.g. Professor, Instructor"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Department</label>
              <input
                type="text"
                value={edit.department}
                onChange={(e) => setEdit((p) => ({ ...p, department: e.target.value }))}
                className={inputClass}
                placeholder="e.g. Computer Science"
              />
            </div>
            <div>
              <label className={labelClass}>Institution</label>
              <input
                type="text"
                value={edit.institution}
                onChange={(e) => setEdit((p) => ({ ...p, institution: e.target.value }))}
                className={inputClass}
                placeholder="University or organization"
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Website</label>
            <input
              type="url"
              value={edit.website}
              onChange={(e) => setEdit((p) => ({ ...p, website: e.target.value }))}
              className={inputClass}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className={labelClass}>Bio</label>
            <textarea
              value={edit.bio}
              onChange={(e) => setEdit((p) => ({ ...p, bio: e.target.value }))}
              rows={3}
              className={inputClass}
              placeholder="Short bio (e.g. research interests, teaching focus)"
            />
          </div>

          <div className="border border-white/10 rounded-lg p-4 bg-white/5">
            <label className={labelClass}>Syllabus logo (PDF & DOCX)</label>
            <p className="text-gray-500 text-xs mb-3">
              This logo will appear on generated syllabi when you download PDF or DOCX from Course Builder. Save as default to reuse.
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleLogoChange}
                className="text-white/80 text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-600 file:text-white file:font-medium"
              />
              {(logoPreview || profile?.logoFilename) && (
                <div className="flex items-center gap-3">
                  <img
                    src={logoPreview || API_ENDPOINTS.UPLOAD_VIEW(profile.logoFilename)}
                    alt="Logo preview"
                    className="h-12 object-contain bg-white/10 rounded-lg p-1"
                  />
                  {logoFile && (
                    <button
                      type="button"
                      onClick={handleSaveLogoAsDefault}
                      disabled={logoUploading}
                      className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                    >
                      {logoUploading ? "Saving…" : "Save as default"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium transition-colors"
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </form>
      </div>
    </div>
  );
}
