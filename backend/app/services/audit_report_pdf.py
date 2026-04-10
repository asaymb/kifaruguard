"""
Compliance PDF report for a single agent run (business-facing, no raw JSON tables).
"""
from __future__ import annotations

import ast
import re
from datetime import datetime
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _strip_signature(output_text: str | None) -> tuple[str, str | None]:
    """Split stored line into display text and HMAC hex if present."""
    if not output_text:
        return "", None
    if " | sig=" in output_text:
        base, sig = output_text.rsplit(" | sig=", 1)
        return base.strip(), sig.strip() or None
    return output_text.strip(), None


def _plain_cell(text: str | None, max_len: int = 400) -> str:
    """Table cells: plain text only (ReportLab Table does not interpret HTML)."""
    if not text:
        return "—"
    s = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", str(text))
    s = s.replace("\n", " ").replace("\r", " ")[:max_len]
    if len(str(text)) > max_len:
        s += "…"
    return s


def _esc_xml(text: str | None, max_len: int = 1200) -> str:
    if not text:
        return "—"
    s = str(text)[:max_len]
    if len(str(text)) > max_len:
        s += "…"
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br/>")
    )


def _parse_result_blob(blob: str | None) -> dict[str, Any] | None:
    if not blob:
        return None
    raw, _ = _strip_signature(blob)
    try:
        val = ast.literal_eval(raw)
        if isinstance(val, dict):
            return val
    except (SyntaxError, ValueError, TypeError):
        pass
    return None


def _human_data_lines(data: dict[str, Any] | None) -> list[str]:
    if not data:
        return []
    lines = []
    for k, v in data.items():
        if v is not None and v != "":
            lines.append(f"{k.replace('_', ' ').title()}: {v}")
    return lines[:12]


def build_compliance_report_pdf(
    *,
    run_id: str,
    agent_type: str,
    logs: list[Any],
    hitl_row: Any | None,
    guardrail_block_statuses: list[str],
) -> bytes:
    """
    logs: ORM AuditLog rows ordered by timestamp ascending.
    hitl_row: HitlQueue or None.
    """
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        name="KGTitle",
        parent=styles["Heading1"],
        fontSize=18,
        spaceAfter=12,
        textColor=colors.HexColor("#0f172a"),
    )
    h2 = ParagraphStyle(name="KGH2", parent=styles["Heading2"], fontSize=13, spaceBefore=14, spaceAfter=8)
    body = ParagraphStyle(name="KGBody", parent=styles["Normal"], fontSize=10, leading=14)

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title="Kifaru Guard Compliance Report",
    )
    story: list[Any] = []

    story.append(Paragraph("Kifaru Guard Compliance Report", title_style))
    story.append(Paragraph(f"<b>Run ID</b>: {_esc_xml(run_id, 200)}", body))
    story.append(Paragraph(f"<b>Agent type</b>: {_esc_xml(agent_type, 80)}", body))
    if logs:
        t0 = logs[0].timestamp
        t1 = logs[-1].timestamp
        story.append(
            Paragraph(
                f"<b>Run period (UTC)</b>: {_esc_xml(str(t0), 80)} → {_esc_xml(str(t1), 80)}",
                body,
            )
        )
    story.append(Spacer(1, 0.4 * cm))

    # --- Summary ---
    story.append(Paragraph("1. Summary", h2))
    # Orchestrator logs END as (step, input_text=result dict str, output_text="done") — final state lives in input_text.
    end_blob = next((log.input_text for log in reversed(logs) if log.step == "END"), None)
    parsed = _parse_result_blob(end_blob)
    if not parsed:
        ex = next((log for log in reversed(logs) if log.step == "EXTRACT_DATA"), None)
        if ex:
            parsed = _parse_result_blob(ex.output_text)
    final_status = (parsed or {}).get("status", "Unknown") if parsed else "Unknown"
    story.append(Paragraph(f"<b>Final outcome</b>: {_esc_xml(str(final_status), 100)}", body))
    data = (parsed or {}).get("data") if parsed else None
    if isinstance(data, dict) and data:
        story.append(Paragraph("<b>Key extracted fields</b>:", body))
        for line in _human_data_lines(data):
            story.append(Paragraph(f"• {_esc_xml(line, 500)}", body))
    else:
        story.append(Paragraph("<b>Key extracted fields</b>: not available from stored result.", body))
    story.append(Spacer(1, 0.3 * cm))

    # --- Step-by-step ---
    story.append(Paragraph("2. Step-by-step audit trail", h2))
    step_rows = [["Step", "Input summary", "Output summary", "Time (UTC)"]]
    for log in logs:
        inp, _s = _strip_signature(log.input_text)
        out, _ = _strip_signature(log.output_text)
        step_rows.append(
            [
                _plain_cell(log.step, 80),
                _plain_cell(inp, 350),
                _plain_cell(out, 350),
                _plain_cell(str(log.timestamp), 24),
            ]
        )
    tbl = Table(step_rows, colWidths=[3.2 * cm, 5.2 * cm, 5.2 * cm, 3.2 * cm], repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ]
        )
    )
    story.append(tbl)
    story.append(Spacer(1, 0.4 * cm))

    # --- Guardrails ---
    story.append(Paragraph("3. Guardrail decisions", h2))
    story.append(
        Paragraph(
            f"<b>Policy</b>: an automatic <b>block</b> is applied when the agent outcome status is one of: "
            f"{_esc_xml(', '.join(guardrail_block_statuses) or 'BLOCKED', 200)}.",
            body,
        )
    )
    gr_log = next((log for log in logs if log.step == "CHECK_RULES"), None)
    if gr_log:
        guard_txt, _ = _strip_signature(gr_log.output_text)
        gd = _parse_result_blob(gr_log.output_text)
        if isinstance(gd, dict) and "allowed" in gd:
            allowed = "Blocked by policy" if not gd.get("allowed") else "Passed (no automatic block)"
            action = gd.get("action", "—")
            story.append(Paragraph(f"<b>Evaluation on this run</b>: {_esc_xml(allowed, 120)}", body))
            story.append(Paragraph(f"<b>Action</b>: {_esc_xml(str(action), 80)}", body))
        else:
            story.append(Paragraph(f"<b>Evaluation on this run</b>: {_esc_xml(guard_txt, 500)}", body))
        story.append(Paragraph(f"<b>Rule context</b>: agent status checked was {_esc_xml(gr_log.input_text, 200)}.", body))
    else:
        story.append(Paragraph("No CHECK_RULES step recorded for this run.", body))
    story.append(Spacer(1, 0.3 * cm))

    # --- HITL ---
    story.append(Paragraph("4. Human review (HITL)", h2))
    if hitl_row and hitl_row.status in ("approved", "rejected"):
        story.append(Paragraph(f"<b>Decision</b>: {_esc_xml(hitl_row.status.title(), 40)}", body))
        story.append(Paragraph(f"<b>Reviewer</b>: {_esc_xml(hitl_row.reviewed_by or '—', 100)}", body))
        ra = hitl_row.reviewed_at or hitl_row.timestamp
        story.append(Paragraph(f"<b>Decision time (UTC)</b>: {_esc_xml(str(ra), 80)}", body))
        story.append(Paragraph(f"<b>Reason for queue</b>: {_esc_xml(hitl_row.reason, 600)}", body))
    elif hitl_row and hitl_row.status == "pending":
        story.append(Paragraph("<b>Status</b>: pending human review (no final approve/reject yet).", body))
    else:
        story.append(Paragraph("No human review queue entry for this run.", body))
    story.append(Spacer(1, 0.3 * cm))

    # --- Integrity ---
    story.append(Paragraph("5. Integrity", h2))
    sigs: list[str] = []
    for log in logs:
        _b, sig = _strip_signature(log.output_text)
        if sig:
            sigs.append(f"{log.step}: {sig}")
    if sigs:
        story.append(Paragraph("<b>HMAC signatures</b> (per audit line, server secret):", body))
        for line in sigs[:30]:
            story.append(Paragraph(f"• {_esc_xml(line, 500)}", body))
        if len(sigs) > 30:
            story.append(Paragraph(f"… {_esc_xml(str(len(sigs) - 30))} further line(s) omitted for length.", body))
    else:
        story.append(Paragraph("No embedded signatures found on stored lines.", body))
    story.append(Spacer(1, 0.2 * cm))
    story.append(
        Paragraph(
            "<i>This report is compiled from tamper-evident audit lines: each step includes an HMAC over its "
            "content using a server-held secret. Altering stored data without the secret invalidates verification.</i>",
            body,
        )
    )

    doc.build(story)
    pdf_bytes = buf.getvalue()
    buf.close()
    return pdf_bytes
