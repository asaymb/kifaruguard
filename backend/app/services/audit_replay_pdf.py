from __future__ import annotations

from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _esc(text: Any) -> str:
    s = str(text or "—")
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _cell(text: Any, limit: int = 220) -> str:
    raw = str(text or "—").replace("\n", " ").replace("\r", " ")
    return (raw[:limit] + "…") if len(raw) > limit else raw


def build_audit_replay_pdf(
    *,
    run_id: str,
    replay_payload: dict,
    generated_at_utc: str | None,
    final_chain: str | None,
) -> bytes:
    styles = getSampleStyleSheet()
    title = ParagraphStyle(name="Title", parent=styles["Heading1"], fontSize=18, spaceAfter=10)
    h2 = ParagraphStyle(name="H2", parent=styles["Heading2"], fontSize=12, spaceBefore=10, spaceAfter=6)
    body = ParagraphStyle(name="Body", parent=styles["Normal"], fontSize=10, leading=14)

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title="Kifaru Guard Audit Replay",
    )

    story: list[Any] = []
    decision = replay_payload.get("reconstructed_decision") or {}
    integrity_valid = bool(replay_payload.get("integrity_valid"))
    broken = replay_payload.get("broken_at_step")
    steps = replay_payload.get("steps") or []

    story.append(Paragraph("Kifaru Guard Audit Replay Report", title))
    story.append(Paragraph(f"<b>Run ID</b>: {_esc(run_id)}", body))
    story.append(Paragraph(f"<b>Generated at (UTC)</b>: {_esc(generated_at_utc)}", body))
    story.append(Spacer(1, 0.25 * cm))

    story.append(Paragraph("1. Decision Summary", h2))
    story.append(Paragraph(f"<b>Status</b>: {_esc(decision.get('status'))}", body))
    story.append(Paragraph(f"<b>Reason</b>: {_esc(decision.get('reason'))}", body))
    story.append(
        Paragraph(
            f"<b>Requires human review</b>: {_esc('Yes' if decision.get('requires_human_review') else 'No')}",
            body,
        )
    )

    story.append(Paragraph("2. Integrity Status", h2))
    if integrity_valid:
        story.append(Paragraph("<b>Verified</b>: all signatures and chain links are valid.", body))
    else:
        story.append(Paragraph("<b>Tampered</b>: integrity verification failed.", body))
        story.append(Paragraph(f"<b>Broken at step</b>: {_esc(broken)}", body))

    story.append(Paragraph("3. Integrity Statement", h2))
    story.append(
        Paragraph(
            "This report is generated from signed audit records. Each timeline step is verified using the stored "
            "signature and chain markers. Any data alteration without the server secret breaks verification.",
            body,
        )
    )

    story.append(Paragraph("4. Timeline", h2))
    rows = [["Step", "Timestamp (UTC)", "Verification", "Details"]]
    for idx, s in enumerate(steps):
        ok = bool(s.get("integrity_verified"))
        badge = "OK" if ok else "FAIL"
        if replay_payload.get("broken_at_step") == idx and not ok:
            badge = "FAIL (broken)"
        details = f"status={s.get('status')} | sig={s.get('signature_valid')} | chain={s.get('chain_valid')}"
        rows.append([_cell(s.get("step"), 60), _cell(s.get("timestamp"), 50), badge, _cell(details, 150)])

    table = Table(rows, colWidths=[3.0 * cm, 4.0 * cm, 3.2 * cm, 6.4 * cm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ]
        )
    )
    story.append(table)

    story.append(Paragraph("5. Final Chain/Hash", h2))
    story.append(Paragraph(f"<b>Final chain marker</b>: {_esc(final_chain or 'not available')}", body))

    doc.build(story)
    out = buf.getvalue()
    buf.close()
    return out
