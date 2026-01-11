/**
 * Webmention Renderer for Hugo PaperMod
 * Fetches interactions from webmention.io and renders them client-side.
 */

(function () {
    const container = document.getElementById("webmentions-container");
    if (!container) return; // Should not happen if script is loaded correctly

    const targets = container.getAttribute("data-targets").split(",");
    if (!targets.length) return;

    const endpoint = "https://webmention.io/api/mentions.jf2";
    const params = new URLSearchParams({
        "sort-by": "published",
        "sort-dir": "up", // Oldest first (like comments)
        per_page: "100"
    });
    targets.forEach(t => params.append("target[]", t));

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
        if (mentions.length === 0) {
            container.innerHTML = "<p></p>"; // No interactions yet. Be the first!
            return;
        }

        // Group types if desired, but for now simple list is robust
        let html = '<ul class="webmentions-list">';

        mentions.forEach(m => {
            // Basic sanitization by using textContent logic via DOM creation or careful templating
            const authorName = escapeHtml(m.author?.name || "Unknown");
            const authorPhoto = m.author?.photo || ""; // Add default avatar if needed
            const authorUrl = m.author?.url || "";
            const published = m.published ? new Date(m.published).toLocaleDateString() : "";
            const content = m.content?.html || m.content?.text || "";
            const wmType = m["wm-property"]; // in-reply-to, like-of, repost-of, mention-of

            // Determine icon/verb
            let verb = "mentioned";
            let icon = "💬";
            if (wmType === "like-of") { verb = "liked"; icon = "❤️"; }
            if (wmType === "repost-of") { verb = "reposted"; icon = "🔁"; }
            if (wmType === "in-reply-to") { verb = "replied"; icon = "↩️"; }

            html += `
        <li class="webmention-item ${wmType}">
          <div class="webmention-meta">
            ${authorPhoto ? `<img src="${escapeHtml(authorPhoto)}" alt="${authorName}" class="webmention-avatar" loading="lazy">` : ''}
            <span class="webmention-author">
              ${authorUrl ? `<a href="${escapeHtml(authorUrl)}" target="_blank" rel="nofollow noopener">${authorName}</a>` : authorName}
            </span>
            <span class="webmention-verb">${verb}</span>
            <span class="webmention-date">${published}</span>
            <a href="${escapeHtml(m.url)}" target="_blank" rel="nofollow noopener" class="webmention-source-link" title="Original Source">🔗</a>
          </div>
          ${(wmType === "in-reply-to" || wmType === "mention-of") && content ?
                    `<div class="webmention-content">${sanitizeContent(content)}</div>` : ''}
        </li>
      `;
        });

        html += '</ul>';
        container.innerHTML = html;
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
    // For interaction content, usually webmention.io gives cleaner HTML,
    // but being safe is better.
    const sanitizeContent = (htmlString) => {
        // Only allow basic formatting.
        // This is a naive implementation; a proper DOMSanitizer is better but heavy.
        // For now, we strip script/iframe/object/style/link/form attributes.
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;

        // Remove unwanted tags
        const forbiddenTags = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'link', 'meta'];
        forbiddenTags.forEach(tag => {
            const elements = tempDiv.querySelectorAll(tag);
            elements.forEach(el => el.remove());
        });

        // Remove inline styles and event handlers
        const allElements = tempDiv.querySelectorAll('*');
        allElements.forEach(el => {
            const attrs = el.attributes;
            for (let i = attrs.length - 1; i >= 0; i--) {
                const name = attrs[i].name;
                if (name.startsWith('on') || name === 'style') {
                    el.removeAttribute(name);
                }
            }
        });

        return tempDiv.innerHTML;
    };

    // Lazy Load Logic using IntersectionObserver
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                fetchMentions();
                observer.disconnect();
            }
        });
    });

    observer.observe(container);

})();
