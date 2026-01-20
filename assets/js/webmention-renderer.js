/**
 * Webmention Renderer for Hugo PaperMod
 * Fetches interactions from webmention.io and renders them client-side.
 *
 * This version renders:
 *  - Likes / Reposts as a compact avatar grid (unchanged)
 *  - Mentions / Replies with a left icon column (48x48) and a right content column:
 *      - first row: author name, verb (replied/mentioned/etc), date, source link
 *      - second row: comment/content box (if available)
 *
 * Important notes:
 *  - The icon for the left column uses classes `webmention-icon` / `webmention-icon-img`
 *    (different from `.webmention-avatar`) so it remains static (no scale transition).
 *  - The script lazy-loads webmentions when the container enters the viewport.
 */

(function () {
  const container = document.getElementById("webmentions-container");
  if (!container) return;

  const rawTargets = container.getAttribute("data-targets") || "";
  const targets = rawTargets
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (!targets.length) return;

  const endpoint = "https://webmention.io/api/mentions.jf2";
  const params = new URLSearchParams({
    "sort-by": "published",
    "sort-dir": "up",
    per_page: "200",
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
        // treat unknowns as mentions
        mentionsList.push(m);
      }
    });

    let html = "";

    // Likes section (compact avatars)
    if (likes.length > 0) {
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
        const authorUrl = m.author?.url || "";
        const wmType = m["wm-property"] || "";

        let avatarHtml = "";
        if (authorPhoto) {
          // keep class webmention-avatar here for existing styles (likes already handled)
          avatarHtml = `<img src="${escapeHtml(authorPhoto)}" alt="${authorName}" class="webmention-avatar" loading="lazy">`;
        } else {
          const initial = escapeHtml(
            (authorName || "U").charAt(0).toUpperCase(),
          );
          avatarHtml = `<span class="webmention-avatar webmention-avatar--placeholder" aria-hidden="true">${initial}</span>`;
        }

        const interactionUrl = m.url || authorUrl;

        const profileLinkStart = interactionUrl
          ? `<a href="${escapeHtml(interactionUrl)}" class="webmention-like-link" target="_blank" rel="nofollow noopener" title="${authorName}">`
          : `<span class="webmention-like-link" title="${authorName}">`;

        const profileLinkEnd = interactionUrl ? `</a>` : `</span>`;

        html += `
          <li class="webmention-like-item ${wmType}">
            ${profileLinkStart}
              ${avatarHtml}
              <span class="sr-only">${authorName} ${wmType === "repost-of" ? "reposted" : "liked"} this</span>
            ${profileLinkEnd}
          </li>
        `;
      });

      html += `</ul></div>`;
    }

    // Mentions section (left icon column + right content column)
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
        const wmType = m["wm-property"]; // in-reply-to, mention-of, etc.

        // Determine verb (for meta)
        let verb = "mentioned";
        if (wmType === "like-of") verb = "liked";
        if (wmType === "repost-of") verb = "reposted";
        if (wmType === "in-reply-to") verb = "replied";

        const interactionUrl = m.url || authorUrl;

        // Choose an icon for the left column:
        // prefer author photo (48x48), otherwise a small emoji representing type
        let iconHtml = "";
        if (authorPhoto) {
          // use a distinct class so CSS can style it as a static 48x48 image
          iconHtml = `<img src="${escapeHtml(authorPhoto)}" alt="${authorName}" class="webmention-icon-img" width="48" height="48" loading="lazy">`;
        } else {
          // emoji fallback
          let emoji = "💬";
          if (wmType === "like-of") emoji = "❤️";
          if (wmType === "repost-of") emoji = "🔁";
          if (wmType === "in-reply-to") emoji = "↩️";
          iconHtml = `<div class="webmention-icon-emoji" aria-hidden="true">${emoji}</div>`;
        }

        if (interactionUrl) {
          iconHtml = `<a href="${escapeHtml(interactionUrl)}" target="_blank" rel="nofollow noopener">${iconHtml}</a>`;
        }

        // Build the list item with two-column layout
        // left: icon column (48px)
        // right: body column (meta row and content row)
        html += `
          <li class="webmention-item ${escapeHtml(wmType || "")}">
            <div class="webmention-row">
              <div class="webmention-icon-column">
                ${iconHtml}
              </div>
              <div class="webmention-body-column">
                <div class="webmention-meta-top">
                  <span class="webmention-author">${interactionUrl ? `<a href="${escapeHtml(interactionUrl)}" target="_blank" rel="nofollow noopener">${authorName}</a>` : authorName}</span>
                  <span class="webmention-verb">${verb}</span>
                  <span class="webmention-date">${published}</span>
                </div>
                ${(wmType === "in-reply-to" || wmType === "mention-of") &&
            content
            ? `<div class="webmention-content">${sanitizeContent(content)}</div>`
            : ``
          }
              </div>
            </div>
          </li>
        `;
      });

      html += `</ul></div>`;
    }

    container.innerHTML = html;
  };

  // Basic HTML escaper (keeps things safe)
  const escapeHtml = (unsafe) => {
    return (unsafe || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  // Simple, conservative sanitizer for content HTML
  const sanitizeContent = (htmlString) => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlString;

    // Remove tags that can introduce scripts or frames
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

    // Remove inline event handlers and style attributes
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

  // Lazy Load: fetch once the container enters the viewport
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
