# Docker Mod runtimes install into the pnpm bin prefix at container start. The
# image sets that prefix in PATH for processes started by the entrypoint, but
# sshd gives login sessions its own default PATH, so add it here as well and
# make interactive shells source this file (see docker/base/Dockerfile).

case ":${PATH}:" in
  *:/usr/local/share/pnpm/bin:*) ;;
  *) PATH="/usr/local/share/pnpm/bin:/usr/local/share/pnpm:${PATH}" ;;
esac
export PATH
