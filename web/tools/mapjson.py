import json, re
def load(path):
    s = open(path).read()
    i = s.index('"groups":') + len('"groups":')
    g = s[i:-1]
    g = re.sub(r'([{,\[])\s*([A-Za-z_][\w]*)\s*:', r'\1"\2":', g)
    g = re.sub(r':\s*([A-Za-z_][\w.\-]*)(?=[,}\]])', lambda m: ':' + (m.group(1) if m.group(1) in ('true', 'false', 'null') else '"' + m.group(1) + '"'), g)
    g = re.sub(r'(?<=[\[,])\s*([A-Za-z_][\w.\-]*)(?=\s*[,\]])', lambda m: m.group(1) if m.group(1) in ('true', 'false', 'null') else '"' + m.group(1) + '"', g)
    d = json.loads(s[:i] + 'null}')
    d['groups'] = json.loads(g)
    return d
