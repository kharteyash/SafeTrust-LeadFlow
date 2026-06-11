// Shared "people" helpers: normalize leads / contacts / closed-leads into a
// common shape and render a read-only detail modal body. Used by the Contacts
// (unified) and Realtors pages.
window.LF = window.LF || {};
LF.People = (function () {
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ----- Closed-lead (CSV) column detection -----
  function detectCol(cols, patterns) { for (const p of patterns) { const c = cols.find(col => p.test(col)); if (c) return c; } return null; }
  function closedName(data) { const k = Object.keys(data || {}); return (data || {})[detectCol(k, [/^primary borrower$/i, /borrower name/i, /full name/i, /^name$/i, /^customer$/i, /^client$/i]) || k[0]] || ''; }
  function closedEmail(data) { const k = Object.keys(data || {}); const c = detectCol(k, [/e-?mail/i]); return c ? data[c] : ''; }
  function closedPhone(data) { const k = Object.keys(data || {}); const c = detectCol(k, [/phone|mobile|\bcell\b|\btel\b/i]); return c ? data[c] : ''; }

  function relLabel(r) {
    return { established: 'Established', developing: 'Developing', dormant: 'Dormant', past: 'Past Connection', unknown: 'Unknown' }[r] || '';
  }

  // ----- Normalizers → { kind, group, id, name, email, phone, company, type, fields[], raw } -----
  function fromContact(c) {
    const isRealtor = c.tag === 'Realtor';
    const typeLabel = isRealtor ? (c.relationship ? `Realtor · ${relLabel(c.relationship)}` : 'Realtor') : (c.tag || 'Contact');
    const fields = [
      { label: 'Email', value: c.email, kind: 'email' },
      { label: 'Phone', value: c.phone, kind: 'phone' },
      { label: 'Company', value: c.company },
      { label: 'Type', value: c.tag || 'Other' }
    ];
    if (isRealtor) fields.push({ label: 'Relationship', value: relLabel(c.relationship) || 'Unknown' });
    if (c.birthday) fields.push({ label: 'Birthday', value: LF.fmtBirthday ? LF.fmtBirthday(c.birthday) : c.birthday });
    return { kind: 'contact', group: isRealtor ? 'realtor' : 'contact', id: c.id, name: c.name, email: c.email || '', phone: c.phone || '', company: c.company || '', type: typeLabel, fields, raw: c };
  }
  function fromLead(l) {
    const fields = [
      { label: 'Email', value: l.email, kind: 'email' },
      { label: 'Phone', value: l.phone, kind: 'phone' },
      { label: 'Buying timeline', value: l.timeline },
      { label: 'Lead score', value: l.stars ? `${l.stars}/5` : '' },
      { label: 'State', value: l.state },
      { label: 'Birthday', value: l.birthday ? (LF.fmtBirthday ? LF.fmtBirthday(l.birthday) : l.birthday) : '' },
      { label: 'Owner', value: l.owner },
      { label: 'Pre-approved', value: l.preapproved ? 'Yes' : 'No' },
      { label: 'Realtor', value: l.realtorName },
      { label: 'Notes', value: l.notes }
    ];
    return { kind: 'lead', group: 'lead', id: l.id, name: l.name, email: l.email || '', phone: l.phone || '', company: '', type: 'Lead', fields, raw: l };
  }
  function fromClient(rec) {
    const data = rec.data || {};
    const fields = Object.keys(data).map(k => ({
      label: k, value: data[k],
      kind: /e-?mail/i.test(k) ? 'email' : (/phone|mobile|\bcell\b|\btel\b/i.test(k) ? 'phone' : '')
    }));
    return { kind: 'client', group: 'client', id: rec.id, name: closedName(data) || '(no name)', email: closedEmail(data) || '', phone: closedPhone(data) || '', company: '', type: 'Client', fields, raw: rec };
  }

  function gmailChooser(to) {
    const compose = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to);
    return 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(compose);
  }

  // The detail-modal body: every non-empty field, with call/email shortcuts.
  function detailBodyHTML(p) {
    const rows = p.fields.filter(f => f.value != null && String(f.value).trim() !== '').map(f => {
      let action = '';
      if (f.kind === 'email') {
        action = `<a href="${escAttr(gmailChooser(f.value))}" target="_blank" rel="noopener" class="btn-icon" title="Email" style="width:26px;height:26px;"><i data-lucide="mail" style="width:13px;height:13px;color:#2255a3;pointer-events:none;"></i></a>`;
      } else if (f.kind === 'phone') {
        const tel = LF.telLink ? LF.telLink(f.value) : '';
        if (tel) action = `<a href="${escAttr(tel)}" class="btn-icon" title="Call" style="width:26px;height:26px;"><i data-lucide="phone" style="width:13px;height:13px;color:#2255a3;pointer-events:none;"></i></a>`;
      }
      return `<div class="flex items-start justify-between gap-3 py-2" style="border-bottom:1px solid var(--border-soft);">
        <span class="text-[12px] text-muted flex-shrink-0" style="max-width:42%;">${esc(f.label)}</span>
        <span class="text-[13px] font-medium text-right" style="word-break:break-word;display:flex;align-items:center;gap:6px;justify-content:flex-end;">${esc(f.value)}${action}</span>
      </div>`;
    }).join('');
    return rows || '<div class="text-[13px] text-muted py-2">No details.</div>';
  }

  // A small colored pill class for each type.
  function typePill(group) {
    return group === 'lead' ? 'pill-blue'
      : group === 'realtor' ? 'pill-yellow'
      : group === 'client' ? 'pill-green'
      : 'pill-gray';
  }

  return { esc, escAttr, fromContact, fromLead, fromClient, detailBodyHTML, gmailChooser, relLabel, typePill };
})();
