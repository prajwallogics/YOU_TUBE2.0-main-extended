import React, { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { formatDistanceToNow } from "date-fns";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

interface CommentReport {
  _id?: string;
  userid: string;
  userreported: string;
  reason: string;
  reportedon: string;
}

interface Comment {
  _id: string;
  videoid: string;
  userid: string;
  commentbody: string;
  usercommented: string;
  commentedon: string;
  likes?: string[];
  dislikes?: string[];
  reports?: CommentReport[];
}

const blockedWords = [
  "fuck",
  "fucker",
  "fucking",
  "shit",
  "shitty",
  "bitch",
  "bitches",
  "asshole",
  "bastard",
  "damn",
  "dumb",
  "stupid",
  "idiot",
  "idiotic",
];

const translationLanguages = [
  { code: "hi", label: "Hindi" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "kn", label: "Kannada"},
];

const leetMap: Record<string, string> = {
  "@": "a",
  "4": "a",
  "$": "s",
  "5": "s",
  "0": "o",
  "1": "i",
  "!": "i",
  "3": "e",
  
};

const normalizeCommentText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[@4$501!3+7]/g, (char) => leetMap[char] || char)
    .replace(/(.)\1{2,}/g, "$1$1")
    .replace(/[^a-z]/g, "");

const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

const containsBlockedLanguage = (text: string) => {
  const normalizedText = normalizeCommentText(text);

  return blockedWords.some((word) => {
    const normalizedWord = normalizeCommentText(word);
    const directMatch = new RegExp(String.raw`\b${escapeRegex(word)}\b`, "i").test(text);

    return directMatch || normalizedText.includes(normalizedWord);
  });
};

const cleanBlockedLanguage = (text: string) =>
  blockedWords.reduce(
    (cleanText, word) =>
      cleanText.replace(
        new RegExp(String.raw`\b${escapeRegex(word)}\b`, "gi"),
        "*".repeat(word.length)
      ),
    text
  );

const translateText = async (text: string, targetLanguage: string) => {
  const response = await fetch(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLanguage}&dt=t&q=${encodeURIComponent(
      text
    )}`
  );
  const data = await response.json();
  const translatedText = data?.[0]?.map((item: any[]) => item[0]).join("");

  if (!translatedText) {
    throw new Error("Translation error");
  }

  return translatedText;
};

const Comments = ({ videoId }: any) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [commentError, setCommentError] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("hi");
  const [translatedComments, setTranslatedComments] = useState<
    Record<string, { language: string; text: string }>
  >({});
  const [translatingCommentId, setTranslatingCommentId] = useState<string | null>(null);
  const [draftTranslation, setDraftTranslation] = useState("");
  const [draftTranslationLanguage, setDraftTranslationLanguage] = useState("");
  const [isTranslatingDraft, setIsTranslatingDraft] = useState(false);
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportError, setReportError] = useState("");
  const [isReportSubmitting, setIsReportSubmitting] = useState(false);

  useEffect(() => {
    loadComments();
  }, [videoId]);

  const loadComments = async () => {
    try {
      const res = await axiosInstance.get(`/comment/${videoId}`);
      setComments(res.data || []);
    } catch (error) {
      console.log(error);
      setComments([]);
    } finally {
      setLoading(false);
    }
  };
  if (loading) {
    return <div>Loading history...</div>;
  }
  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;
    if (!user) return;
    if (containsBlockedLanguage(newComment)) {
      setCommentError("Please keep comments respectful before posting.");
      return;
    }

    setIsSubmitting(true);
    setCommentError("");
    try {
      const res = await axiosInstance.post("/comment/postcomment", {
        videoid: videoId,
        userid: user._id,
        commentbody: newComment.trim(),
        usercommented: user.name,
        
      });
      if (res.data.comment) {
        await loadComments();
      }
      setNewComment("");
      setDraftTranslation("");
      setDraftTranslationLanguage("");
    } catch (error) {
      console.error("Error adding comment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (comment: Comment) => {
    setEditingCommentId(comment._id);
    setEditText(comment.commentbody);
  };

  const handleUpdateComment = async () => {
    if (!editText.trim()) return;
    if (!user) return;
    if (containsBlockedLanguage(editText)) {
      setCommentError("keep comments in your limit  before saving.");
      return;
    }

    try {
      const res = await axiosInstance.post(
        `/comment/editcomment/${editingCommentId}`,
        { commentbody: editText.trim() }
      );
      if (res.data) {
        setComments((prev) =>
          prev.map((c) =>
            c._id === editingCommentId ? { ...c, commentbody: editText.trim() } : c
          )
        );
        setTranslatedComments((prev) => {
          const next = { ...prev };
          if (editingCommentId) {
            delete next[editingCommentId];
          }
          return next;
        });
        setEditingCommentId(null);
        setEditText("");
        setCommentError("");
      }
    } catch (error) {
      console.log(error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      const res = await axiosInstance.delete(`/comment/deletecomment/${id}`);
      if (res.data.comment) {
        setComments((prev) => prev.filter((c) => c._id !== id));
      }
    } catch (error) {
      console.log(error);
    }
  };

  const updateCommentInList = (updatedComment: Comment) => {
    setComments((prev) =>
      prev.map((comment) =>
        comment._id === updatedComment._id ? updatedComment : comment
      )
    );
  };

  const handleCommentReaction = async (
    commentId: string,
    action: "like" | "dislike"
  ) => {
    if (!user) return;

    try {
      const res = await axiosInstance.post(`/comment/reactcomment/${commentId}`, {
        userId: user._id,
        action,
      });
      updateCommentInList(res.data);
    } catch (error) {
      console.log(error);
    }
  };

  const handleOpenReport = (comment: Comment) => {
    const existingReport = comment.reports?.find(
      (report) => report.userid === user?._id
    );

    setReportCommentId(comment._id);
    setReportReason(existingReport?.reason || "");
    setReportError("");
  };

  const handleSubmitReport = async (commentId: string) => {
    if (!user) return;
    if (!reportReason.trim()) {
      setReportError("Write a reason before reporting.");
      return;
    }
    if (containsBlockedLanguage(reportReason)) {
      setReportError("Please keep reports respectful before posting.");
      return;
    }

    setIsReportSubmitting(true);
    setReportError("");
    try {
      const res = await axiosInstance.post(`/comment/reportcomment/${commentId}`, {
        userId: user._id,
        userreported: user.name,
        reason: reportReason.trim(),
      });
      updateCommentInList(res.data);
      setReportCommentId(null);
      setReportReason("");
    } catch (error: any) {
      console.log(error);
      setReportError(error?.response?.data?.message || "Report was not saved.");
    } finally {
      setIsReportSubmitting(false);
    }
  };

  const handleTranslateDraft = async () => {
    if (!newComment.trim()) return;
    if (containsBlockedLanguage(newComment)) {
      setCommentError("are u out of your mind!!.");
      setDraftTranslation("");
      setDraftTranslationLanguage("");
      return;
    }

    setIsTranslatingDraft(true);
    setCommentError("");
    try {
      const translatedText = await translateText(newComment.trim(), targetLanguage);
      setDraftTranslation(translatedText);
      setDraftTranslationLanguage(targetLanguage);
    } catch (error) {
      console.log(error);
      setCommentError("Translation unavailable right now.");
      setDraftTranslation("");
      setDraftTranslationLanguage("");
    } finally {
      setIsTranslatingDraft(false);
    }
  };

  const handleTranslateComment = async (comment: Comment) => {
    const existingTranslation = translatedComments[comment._id];

    if (existingTranslation?.language === targetLanguage) {
      setTranslatedComments((prev) => {
        const next = { ...prev };
        delete next[comment._id];
        return next;
      });
      return;
    }

    setTranslatingCommentId(comment._id);
    try {
      const textToTranslate = cleanBlockedLanguage(comment.commentbody);
      const translatedText = await translateText(textToTranslate, targetLanguage);

      setTranslatedComments((prev) => ({
        ...prev,
        [comment._id]: {
          language: targetLanguage,
          text: translatedText,
        },
      }));
    } catch (error) {
      console.log(error);
      setTranslatedComments((prev) => ({
        ...prev,
        [comment._id]: {
          language: targetLanguage,
          text: "Translation unavailable right now.",
        },
      }));
    } finally {
      setTranslatingCommentId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">{comments.length} Comments</h2>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Translate to
          <select
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
          >
            {translationLanguages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-4">
          <Avatar className="w-10 h-10">
            <AvatarImage src={user?.image || ""} />
            <AvatarFallback>{user?.name?.[0] || "G"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <Textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e: any) => {
                setNewComment(e.target.value);
                setCommentError("");
                setDraftTranslation("");
                setDraftTranslationLanguage("");
              }}
              className="min-h-[80px] resize-none border-0 border-b-2 rounded-none focus-visible:ring-0"
            />
            {draftTranslation && (
              <div className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700">
                <p>{draftTranslation}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    className="font-medium text-gray-700"
                    onClick={() => {
                      setNewComment(draftTranslation);
                      setDraftTranslation("");
                      setDraftTranslationLanguage("");
                    }}
                  >
                    Use translation
                  </button>
                  <button
                    className="text-gray-500"
                    onClick={() => {
                      setDraftTranslation("");
                      setDraftTranslationLanguage("");
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
            {commentError && (
              <p className="text-sm text-red-600">{commentError}</p>
            )}
            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                variant="outline"
                className="bg-white-600 text-black hover:bg-black-700 disabled:bg-white-300 disabled:text-black"
                onClick={handleTranslateDraft}
                disabled={
                  !newComment.trim() ||
                  isTranslatingDraft ||
                  draftTranslationLanguage === targetLanguage
                }
              >
                {isTranslatingDraft ? "Translating..." : "Preview"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setNewComment("");
                  setCommentError("");
                  setDraftTranslation("");
                  setDraftTranslationLanguage("");
                }}
                disabled={!newComment.trim()}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitComment}
                disabled={!newComment.trim() || isSubmitting}
              >
                Comment
              </Button>
            </div>
          </div>
      </div>
      <div className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            No comments yet. Be the first to comment!
          </p>
        ) : (
          comments.map((comment) => (
            <div key={comment._id} className="flex gap-4">
              <Avatar className="w-10 h-10">
                <AvatarImage src="/placeholder.svg?height=40&width=40" />
                <AvatarFallback>{comment.usercommented[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">
                    {comment.usercommented}
                  </span>
                  <span className="text-xs text-gray-600">
                    {formatDistanceToNow(new Date(comment.commentedon))} ago
                  </span>
                </div>

                {editingCommentId === comment._id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editText}
                      onChange={(e) => {
                        setEditText(e.target.value);
                        setCommentError("");
                      }}
                    />
                    {commentError && (
                      <p className="text-sm text-red-600">{commentError}</p>
                    )}
                    <div className="flex gap-2 justify-end">
                      <Button
                        onClick={handleUpdateComment}
                        disabled={!editText.trim()}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditingCommentId(null);
                          setEditText("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {(() => {
                      const hasLiked = comment.likes?.includes(user?._id);
                      const hasDisliked = comment.dislikes?.includes(user?._id);
                      const hasReported = comment.reports?.some(
                        (report) => report.userid === user?._id
                      );
                      const canReport = user && comment.userid !== user._id;

                      return (
                        <>
                    <p className="text-sm">
                      {cleanBlockedLanguage(comment.commentbody)}
                    </p>
                    {translatedComments[comment._id] && (
                      <p className="mt-2 rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700">
                        {translatedComments[comment._id].text}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2 text-sm text-gray-500">
                      <button
                        className={hasLiked ? "font-medium text-blue-600" : ""}
                        onClick={() => handleCommentReaction(comment._id, "like")}
                      >
                        Like {comment.likes?.length || 0}
                      </button>
                      <button
                        className={hasDisliked ? "font-medium text-red-600" : ""}
                        onClick={() => handleCommentReaction(comment._id, "dislike")}
                      >
                        Dislike {comment.dislikes?.length || 0}
                      </button>
                      <button onClick={() => handleTranslateComment(comment)}>
                        {translatingCommentId === comment._id
                          ? "Translating..."
                          : translatedComments[comment._id]?.language === targetLanguage
                          ? "Hide translation"
                          : "Translate"}
                      </button>
                      {!!comment.reports?.length && (
                        <span>{comment.reports.length} report{comment.reports.length === 1 ? "" : "s"}</span>
                      )}
                      {canReport && (
                        <button
                          className={hasReported ? "font-medium text-red-600" : ""}
                          onClick={() => handleOpenReport(comment)}
                        >
                          {hasReported ? "Reported" : "Report"}
                        </button>
                      )}
                      {comment.userid === user?._id && (
                        <>
                        <button onClick={() => handleEdit(comment)}>
                          Edit
                        </button>
                        <button onClick={() => handleDelete(comment._id)}>
                          Delete
                        </button>
                        </>
                      )}
                      </div>
                      {reportCommentId === comment._id && (
                        <div className="mt-3 space-y-2 rounded-md border border-gray-200 p-3">
                          <Textarea
                            placeholder="Tell us why this comment is inappropriate..."
                            value={reportReason}
                            onChange={(e) => {
                              setReportReason(e.target.value);
                              setReportError("");
                            }}
                            className="min-h-[70px]"
                          />
                          {reportError && (
                            <p className="text-sm text-red-600">{reportError}</p>
                          )}
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setReportCommentId(null);
                                setReportReason("");
                                setReportError("");
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => handleSubmitReport(comment._id)}
                              disabled={isReportSubmitting || !reportReason.trim()}
                            >
                              {isReportSubmitting ? "Reporting..." : "Submit report"}
                            </Button>
                          </div>
                        </div>
                      )}
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Comments;
