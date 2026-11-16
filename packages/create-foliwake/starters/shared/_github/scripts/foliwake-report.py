#!/usr/bin/env python3
"""Job summary and step outputs for the answer of a Foliwake forced command.

Usage: foliwake-report.py <production|rollback|branch-preview> <result.json>
Outputs (GITHUB_OUTPUT): state (the result or state field), url, revision.
"""
import json, os, sys


def seconds(ms):
    return f'{ms / 1000:.1f} s' if isinstance(ms, (int, float)) else '?'


def timing_lines(t):
    """Where a deploy's time went (its answer's `timings`): the total, then each step with its store requests."""
    if not isinstance(t, dict) or not isinstance(t.get('steps'), dict):
        return []
    store = t.get('store') if isinstance(t.get('store'), dict) else {}
    per_step = t.get('stepStore') if isinstance(t.get('stepStore'), dict) else {}
    out = [f"- took: `{seconds(t.get('totalMs'))}`; pages built: `{t.get('pagesBuilt')}`; store requests: `{store.get('requests')}`", '',
           '| step | time | store requests |', '| --- | ---: | ---: |']
    for step, ms in t['steps'].items():
        requests = per_step.get(step, {}).get('requests') if isinstance(per_step.get(step), dict) else None
        out.append(f"| {step} | {seconds(ms)} | {'' if requests is None else requests} |")
    return out


kind, path = sys.argv[1], sys.argv[2]
try:
    r = json.load(open(path))
except (OSError, ValueError):
    r = {'result': 'failed', 'state': 'failed', 'message': 'no JSON answer from the server'}

state = r.get('result') or r.get('state') or 'failed'
with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
    out.write(f"state={state}\nurl={r.get('url') or ''}\nrevision={r.get('revision') or r.get('mainCommit') or ''}\n")

if kind == 'branch-preview':
    lines = [f"### Branch preview: {r.get('branch', '')}", '', f'- state: `{state}`']
    if r.get('url'):
        lines.append(f"- URL: {r['url']} (owner Basic auth)")
    rows = [('build commit', r.get('revision')), ('code release', r.get('codeRelease'))]
else:
    title = 'Frontend production' if kind == 'production' else 'Frontend rollback'
    refresh = r.get('cacheRefresh') or {}
    rows = [('action', r.get('action')), ('commit', r.get('sourceCommit') or r.get('mainCommit')), ('built commit', r.get('mainCommit')),
            ('code release', r.get('codeRelease')), ('preview release', r.get('previewRelease')), ('release with', r.get('expect')),
            ('live release' if kind == 'production' else 'to', r.get('siteRelease')), ('live before', r.get('previousSiteRelease')), ('result', state),
            ('code release mode', r.get('mode')), ('code', r.get('code')), ('operation', r.get('operation')),
            ('cache refresh', refresh.get('state')), ('delivered', r.get('delivered') if kind == 'rollback' or state == 'released' else None), ('record', r.get('record'))]
    lines = [f'### {title}', '']
    if state == 'released':
        rows.append(('next', 'nothing: code and pages are live as one site release; roll back with a manual run of this workflow if needed'))
    elif state == 'prepared' and r.get('held'):
        rows.append(('next', 'the automatic release was held (see the checks below); live is unchanged. Fix it and push again, or review and Release in the Foliwake admin'))
    elif state == 'prepared':
        rows.append(('next', 'review the preview, then Release in the Foliwake admin; live is unchanged'))
lines += [f'- {k}: `{v}`' for k, v in rows if v is not None]
lines += timing_lines(r.get('timings'))
for g in (r.get('gates') or []):
    if isinstance(g, dict):
        lines.append(f"  - check {g.get('gate')}: {'ok' if g.get('ok') else 'FAILED'} — {g.get('detail')}")
for d in (r.get('diagnostics') or [])[:20]:
    lines.append(f"  - {d.get('file')}:{d.get('line')} {d.get('code')}: {d.get('message')}")
if r.get('message'):
    lines.append(f"- {r['message']}")
with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
    summary.write('\n'.join(lines) + '\n')
