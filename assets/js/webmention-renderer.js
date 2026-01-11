/**
 * Webmention Renderer for Hugo PaperMod
 * Fetches interactions from webmention.io and renders them client-side.
 *
 * Changes:
 * - Groups interactions into "Likes" (likes + reposts) and "Mentions" (mentions + replies)
 * - Renders Likes as a compact avatar-only grid where each avatar links to the author's URL
 * - Renders Mentions as the previous, fuller list with content for replies/mentions
 */

(function () {
  const container = document.getElementById("webmentions-container");
  if (!container) return;

  // data-targets might be separated by commas and spaces (see partial)
  const rawTargets = container.getAttribute("data-targets") || "";
  const targets = rawTargets
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (!targets.length) return;

  const endpoint = "https://webmention.io/api/mentions.jf2";
  const params = new URLSearchParams({
    "sort-by": "published",
    "sort-dir": "up", // Oldest first (like comments)
    per_page: "100",
  });
  targets.forEach((t) => params.append("target[]", t));

  const fetchMentions = async () => {
    try {
      container.innerHTML = "<p>Loading interactions...</p>";
      const response = await fetch(`${endpoint}?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load webmentions");

      const data = await response.json();
      renderMentions(data.children || []);
    } catch (e) {
      container.innerHTML = "<p>Could not load interaction data.</p>";
      console.error(e);
    }
  };

  const renderMentions = (mentions) => {
    if (!mentions || mentions.length === 0) {
      container.innerHTML = "<p></p>";
      return;
    }

    // Partition mentions into likes (like-of, repost-of) and mentions (in-reply-to, mention-of)
    const likes = [];
    const mentionsList = [];

    mentions.forEach((m) => {
      const wmType = m["wm-property"];
      if (wmType === "like-of" || wmType === "repost-of") {
        likes.push(m);
      } else if (wmType === "in-reply-to" || wmType === "mention-of") {
        mentionsList.push(m);
      } else {
        // Treat unknown types as mentions by default
        mentionsList.push(m);
      }
    });

    // Build HTML
    let html = "";

    // Likes section (compact avatars)
    if (likes.length > 0) {
      // Deduplicate by author url when possible to avoid multiple avatars for same author
      const seen = new Set();
      const uniqueLikes = [];
      likes.forEach((l) => {
        const authorUrl =
          (l.author && (l.author.url || l.author.uid || l.author.name)) ||
          l.url ||
          "";
        const key =
          authorUrl || (l.author && l.author.name) || JSON.stringify(l);
        if (!seen.has(key)) {
          seen.add(key);
          uniqueLikes.push(l);
        }
      });

      html += `<div class="webmentions-likes" aria-live="polite">`;
      html += `<h4 class="webmentions-heading">Likes</h4>`;
      html += `<ul class="webmention-likes-list" role="list">`;

      uniqueLikes.forEach((m) => {
        const authorName = escapeHtml(m.author?.name || "Unknown");
        const authorPhoto = m.author?.photo || "";
        const authorUrl = m.author?.url || m.author?.url || "";
        const wmType = m["wm-property"] || "";

        // For accessibility, include a visually hidden label, but visually we only show the avatar.
        let avatarHtml = "";
        if (authorPhoto) {
          avatarHtml = `<img src="${escapeHtml(authorPhoto)}" alt="${authorName}" class="webmention-avatar" loading="lazy">`;
        } else {
          // Fallback placeholder with initial
          const initial = escapeHtml(
            (authorName || "U").charAt(0).toUpperCase(),
          );
          avatarHtml = `<span class="webmention-avatar webmention-avatar--placeholder" aria-hidden="true">${initial}</span>`;
        }

        const profileLinkStart = authorUrl
          ? `<a href="${escapeHtml(authorUrl)}" class="webmention-like-link" target="_blank" rel="nofollow noopener" title="${authorName}">`
          : `<span class="webmention-like-link" title="${authorName}">`;

        const profileLinkEnd = authorUrl ? `</a>` : `</span>`;

        html += `
                    <li class="webmention-like-item ${wmType}">
                        ${profileLinkStart}
                            ${avatarHtml}
                            <span class="sr-only"> ${authorName} ${wmType === "repost-of" ? "reposted" : "liked"} this</span>
                        ${profileLinkEnd}
                    </li>
                `;
      });

      html += `</ul></div>`;
    }

    // Mentions section (full items)
    if (mentionsList.length > 0) {
      html += `<div class="webmentions-mentions" aria-live="polite">`;
      html += `<h4 class="webmentions-heading">Mentions</h4>`;
      html += `<ul class="webmentions-list">`;

      mentionsList.forEach((m) => {
        const authorName = escapeHtml(m.author?.name || "Unknown");
        const authorPhoto = m.author?.photo || "";
        const authorUrl = m.author?.url || "";
        const published = m.published
          ? new Date(m.published).toLocaleDateString()
          : "";
        const content = m.content?.html || m.content?.text || "";
        const wmType = m["wm-property"]; // in-reply-to, like-of, repost-of, mention-of

        // Determine verb/icon for meta
        let verb = "mentioned";
        let icon = "💬";
        if (wmType === "like-of") {
          verb = "liked";
          icon = "❤️";
        }
        if (wmType === "repost-of") {
          verb = "reposted";
          icon = "🔁";
        }
        if (wmType === "in-reply-to") {
          verb = "replied";
          icon = "↩️";
        }

        html += `
                    <li class="webmention-item ${wmType}">
                      <div class="webmention-meta">
                        ${authorPhoto ? `<img src="${escapeHtml(authorPhoto)}" alt="${authorName}" class="webmention-avatar" loading="lazy">` : `<span class="webmention-avatar webmention-avatar--placeholder">${escapeHtml((authorName || "U").charAt(0).toUpperCase())}</span>`}
                        <span class="webmention-author">
                          ${authorUrl ? `<a href="${escapeHtml(authorUrl)}" target="_blank" rel="nofollow noopener">${authorName}</a>` : authorName}
                        </span>
                        <span class="webmention-verb">${verb}</span>
                        <span class="webmention-date">${published}</span>
                        <a href="${escapeHtml(m.url)}" target="_blank" rel="nofollow noopener" class="webmention-source-link" title="Original Source">🔗</a>
                      </div>
                      ${
                        (wmType === "in-reply-to" || wmType === "mention-of") &&
                        content
                          ? `<div class="webmention-content">${sanitizeContent(content)}</div>`
                          : ""
                      }
                    </li>
                `;
      });

      html += `</ul></div>`;
    }

    // If neither exists (shouldn't happen), show nothing
    if (!html) {
      container.innerHTML = "<p></p>";
    } else {
      container.innerHTML = html;
    }
  };

  // Simple HTML escaper
  const escapeHtml = (unsafe) => {
    return (unsafe || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  // Content sanitization (strips potentially dangerous tags)
  const sanitizeContent = (htmlString) => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlString;

    // Remove unwanted tags
    const forbiddenTags = [
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "form",
      "link",
      "meta",
    ];
    forbiddenTags.forEach((tag) => {
      const elements = tempDiv.querySelectorAll(tag);
      elements.forEach((el) => el.remove());
    });

    // Remove inline styles and event handlers
    const allElements = tempDiv.querySelectorAll("*");
    allElements.forEach((el) => {
      const attrs = el.attributes;
      for (let i = attrs.length - 1; i >= 0; i--) {
        const name = attrs[i].name;
        if (name.startsWith("on") || name === "style") {
          el.removeAttribute(name);
        }
      }
    });

    return tempDiv.innerHTML;
  };

  // Lazy Load Logic using IntersectionObserver
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        fetchMentions();
        observer.disconnect();
      }
    });
  });

  observer.observe(container);
})();
