# Developer Certificate of Origin (DCO)

Pantheon uses the **Developer Certificate of Origin** (DCO) for contribution
licensing — not a Contributor License Agreement (CLA). The DCO is a
lightweight, per-commit attestation pioneered by the Linux kernel and adopted
by GitLab, Docker, Chef, the CNCF, and many other open-source projects.

Every commit that lands on `main` must include a `Signed-off-by` trailer
asserting the DCO terms below. Git adds this trailer automatically when you
pass the `-s` flag:

```bash
git commit -s -m "feat(scope): subject"
```

The trailer looks like this in the commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

By adding that line you are certifying the four points of the DCO v1.1
reproduced verbatim below. No further legal paperwork is required for
first-time or recurring contributors. The name and email in the sign-off
should match the git author identity on the commit.

If you forget the sign-off on a commit, you can amend it with
`git commit --amend -s --no-edit`, or rebase and sign off a batch of commits
with `git rebase --signoff <base>`.

---

## Developer Certificate of Origin

Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
