#!/usr/bin/env python3
"""把 Ad-Hoc 测试包放到 /var/www/lifestamps/_t/（走 paramiko，跟本地部署脚本同一套路数）

🔴 这个文件里没有任何凭据，全部从环境变量读（CI 里是 GitHub Secrets）。
⚠️ 不叫 _deploy_*.py：仓里的 .gitignore 把那个前缀整个挡掉了，叫那个名字会静默不进仓。
"""
import os, sys, posixpath, paramiko

HOST = os.environ["OTA_SSH_HOST"]
PORT = int(os.environ.get("OTA_SSH_PORT", "22"))
USER = os.environ["OTA_SSH_USER"]
PWD  = os.environ["OTA_SSH_PASSWORD"]

LIVE  = "/var/www/lifestamps/_t"
STAGE = "/tmp/lifestamps_ota"          # 🔴 用 /tmp 不用 ~：sudo bash -c 里的 ~ 会变成 root 的家目录
FILES = sys.argv[1:]
if not FILES:
    sys.exit("没有要传的文件")


def run(ssh, cmd, sudo=False):
    if sudo:
        cmd = "sudo -S -p '' bash -c " + "'" + cmd.replace("'", "'\"'\"'") + "'"
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=120)
    if sudo:
        stdin.write(PWD + "\n"); stdin.flush()
    rc = stdout.channel.recv_exit_status()
    out, err = stdout.read().decode(errors="replace"), stderr.read().decode(errors="replace")
    if rc != 0:
        sys.exit(f"远端命令失败 rc={rc}\n{cmd[:80]}\n{err[:400]}")
    return out


ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, PORT, USER, PWD, timeout=25)

run(ssh, f"rm -rf {STAGE} && mkdir -p {STAGE}")
sftp = ssh.open_sftp()
for f in FILES:
    name = os.path.basename(f)
    sftp.put(f, posixpath.join(STAGE, name))
    print(f"  传了 {name}  {os.path.getsize(f)//1024}KB")
sftp.close()

# 🔴 --delete 不能用：_t/ 是我们自己的目录，但网页部署那边已经 --exclude '_t/' 了，
#    这里只覆盖同名文件，别把目录整个清空——万一将来手动放了别的东西进去。
run(ssh, f"mkdir -p {LIVE} && cp -a {STAGE}/. {LIVE}/ "
         f"&& chown -R www-data:www-data {LIVE} && chmod -R a+rX {LIVE} && rm -rf {STAGE}", sudo=True)
print("落位完成：", run(ssh, f"ls -l {LIVE}"))
ssh.close()
