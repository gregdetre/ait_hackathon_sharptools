### patch
(copy/paste the full raw diff here)

### task

rewrite this discarding the minor and trivial changes and output only the significant diffs, as a new diff
'significant' diffs are ones that functionally alter the semantic behaviour of the codebase. Things that are insignificant are imports, renaming within a closed scope, etc. Things are significant are API surface, exported/non-private types etc.

### outputs

2 copies of the input diff, differing in the level of abstraction and ellision.
One is closer to the original diff with insignificant items removed or replaced with eg "..."
The other is closer to a high-level natural language summary of the diff, still inline with code, but with a lot more removed or summarised into words

