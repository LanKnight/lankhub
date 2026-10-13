# 邮箱验证码发送模块 · 开发文档

> 项目：lankhub.xyz 邮箱登录 / 验证码系统
> 技术栈：Python 3.13 + Resend SDK
> 最后更新：2026-10-13

---

## 一、项目背景与目标

为 `lankhub.xyz` 的登录系统提供**邮箱验证码**能力，替代或补充传统的账号密码登录。整体流程：

```
用户输入邮箱 → 后端生成验证码 → Resend 发送邮件 → 用户收到验证码
   → 前端提交验证码 → 后端校验 → 登录成功
```

本文档覆盖当前已完成的部分（**发送验证码**），以及后续接入登录系统时的扩展建议。

---

## 二、技术选型

| 组件 | 说明 |
| :--- | :--- |
| **Resend** | 邮件发送服务商，开发者友好，免费额度 3000 封/月，100 封/天 |
| **resend (Python SDK)** | 官方 SDK，同时提供同步与异步 API |
| **python-dotenv** | 本地开发时加载 `.env` 文件（服务器上用系统环境变量，不依赖它） |
| **发件域名** | `lankhub.xyz`，已在 Resend 完成 DKIM / SPF / DMARC 验证 |
| **发件地址** | 建议使用 `noreply@lankhub.xyz` |

---

## 三、已完成的内容清单

- [x] Resend 账号注册，获取 API Key
- [x] 域名 `lankhub.xyz` 添加至 Resend，并完成 DNS 验证（DKIM / CNAME / DMARC 全部通过）
- [x] 阿里云云解析 DNS 批量导入 4 条记录
- [x] 本地 Python 脚本 `aaa.py` 实现"生成验证码 → 发送邮件"闭环
- [x] 使用 `lanknight@qq.com` 实测成功收到邮件

---

## 四、代码结构说明

### 4.1 完整代码（当前版本）

```python
"""
使用 Resend Python SDK 发送邮箱验证码
文件：aaa.py
"""
import os
import random
import resend
from resend.exceptions import ResendError

# ---------- 配置 ----------
resend.api_key = os.environ["RESEND_API_KEY"]
FROM_EMAIL = "noreply@lankhub.xyz"
TO_EMAIL = "lanknight@qq.com"


def generate_otp(length: int = 6) -> str:
    """生成指定长度的数字验证码"""
    return "".join(random.choices("0123456789", k=length))


def send_verification_email(to_email: str, otp_code: str) -> dict:
    """
    发送验证码邮件
    :param to_email: 收件人邮箱
    :param otp_code: 验证码
    :return: Resend API 响应
    """
    params: resend.Emails.SendParams = {
        "from": FROM_EMAIL,
        "to": [to_email],
        "subject": "您的验证码",
        "html": f"""
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #333;">邮箱验证</h2>
            <p>您好，您的验证码是：</p>
            <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px;
                      color: #2563eb; text-align: center; padding: 16px;
                      background: #f0f4ff; border-radius: 8px;">
                {otp_code}
            </p>
            <p style="color: #666; font-size: 14px;">
                验证码 10 分钟内有效，请勿泄露给他人。
            </p>
            <hr style="border: none; border-top: 1px solid #eee;" />
            <p style="color: #999; font-size: 12px;">
                此邮件由 lankhub.xyz 自动发送，请勿回复。
            </p>
        </div>
        """,
    }

    try:
        email: resend.Emails.SendResponse = resend.Emails.send(params)
        print(f"✅ 邮件已提交: {email}")
        return email
    except ResendError as e:
        print(f"❌ 发送失败: {e}")
        raise


if __name__ == "__main__":
    otp = generate_otp(6)
    print(f"生成的验证码: {otp}")
    send_verification_email(TO_EMAIL, otp)
```

### 4.2 关键代码解释

| 代码片段 | 作用 |
| :--- | :--- |
| `resend.api_key = os.environ["RESEND_API_KEY"]` | 从**环境变量**读取 API Key，不硬编码，避免泄露 |
| `random.choices("0123456789", k=length)` | 生成 6 位纯数字验证码，密码学强度足够用于登录验证；如需更高安全性可换 `secrets.randbelow()` |
| `resend.Emails.SendParams` | 类型提示（TypedDict），告诉 IDE 参数字段 |
| `"to": [to_email]` | 注意是**列表**，即便只有一个人；多收件人会按多封计费 |
| `html` 字段 | 邮件正文，支持完整 HTML；如需纯文本版本可加 `text` 字段 |
| `except ResendError` | 捕获 SDK 抛出的异常，便于日志和重试 |

---

## 五、API Key 管理规范

> **这是整个系统最敏感的部分，务必严格遵守。**

### 5.1 本地开发环境

**系统环境变量**

在 Windows 中通过"系统属性 → 环境变量"配置，配置后**必须重开终端**才生效。这种方式 Key 保存在注册表，不会进入 Git，安全性较好。

### 5.2 服务器环境（生产）

服务器端已经将API配置完成，这是脱敏处理后的服务器输出：

```

root@i:~# sudo nano /etc/profile.d/resend.sh
root@i:~# sudo chmod 644 /etc/profile.d/resend.sh
root@i:~# source /etc/profile.d/resend.sh
root@i:~# echo $RESEND_API_KEY
re_iMa5Cu********
root@i:~# bash -l -c 'echo $RESEND_API_KEY'
re_iMa5Cu********

```

### 5.3 Key 安全红线

| 禁止事项 | 原因 |
| :--- | :--- |
| ❌ 把 Key 硬编码在 `.py` 文件里 | 容易随代码泄露到 Git |
| ❌ 把 Key 提交到 GitHub | GitHub 会扫描并自动通知 Resend 吊销 |
| ❌ 把 Key 写进前端 JS | 任何人打开浏览器都能看到 |
| ❌ 在聊天工具/邮件里明文传递 | 存档记录等于泄露 |
| ❌ 多人共用同一个 Key | 出问题无法追溯是谁调用的 |

**如果发现 Key 泄露**：立即登录 [resend.com/api-keys](https://resend.com/api-keys) 吊销旧 Key 并生成新的。

---

## 六、依赖清单

创建 `requirements.txt`：

```
resend>=2.0.0
python-dotenv>=1.0.0
```

安装：
```bash
pip install -r requirements.txt
```

---

## 七、DNS 配置说明（已完成，供记录）

在阿里云云解析 DNS 中，为 `lankhub.xyz` 添加了以下 4 条记录：

| 类型 | 主机记录 | 记录值 | 用途 |
| :--- | :--- | :--- | :--- |
| TXT | `resend._domainkey` | `p=MIGf...IDAQAB` | DKIM 签名 |
| CNAME | `rsend` | `rsend-apne1.forge.rmta.net` | Resend 发信 |
| CNAME | `send` | `send.forge.rmta.net` | Resend 发信 |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | 反欺诈策略 |

状态：全部 ✅ **Verified**

---

## 八、接入登录系统的下一步设计

当前只完成了"发送"部分。完整的邮箱验证码登录还需要以下模块：

### 8.1 数据存储设计

建议在数据库中建一张表：

```sql
CREATE TABLE email_verification (
    id          BIGINT PRIMARY KEY AUTO_INCREMENT,
    email       VARCHAR(255) NOT NULL,
    code        VARCHAR(6)   NOT NULL,
    scene       VARCHAR(32)  NOT NULL DEFAULT 'login',  -- login / register / reset
    expires_at  DATETIME     NOT NULL,
    used        TINYINT      NOT NULL DEFAULT 0,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email_scene (email, scene)
);
```

或使用 Redis：
```
KEY: verify:login:lanknight@qq.com
VALUE: 511841
TTL:   600
```

### 8.2 完整接口设计

| 接口 | 方法 | 说明 |
| :--- | :--- | :--- |
| `/api/auth/send-code` | POST | 发送验证码，入参 `{email}` |
| `/api/auth/login-by-code` | POST | 验证码登录，入参 `{email, code}` |
| `/api/auth/logout` | POST | 登出 |

### 8.3 后端流程（伪代码）

```python
@app.post("/api/auth/send-code")
def send_code(email: str):
    # 1. 频率限制：同一邮箱 60 秒内只能发一次
    if redis.exists(f"cooldown:{email}"):
        raise HTTPException(429, "请求过于频繁，请稍后再试")

    # 2. 生成验证码
    code = generate_otp(6)

    # 3. 存储（10 分钟过期）
    redis.setex(f"verify:login:{email}", 600, code)
    redis.setex(f"cooldown:{email}", 60, "1")

    # 4. 发送邮件
    send_verification_email(email, code)

    return {"ok": True}


@app.post("/api/auth/login-by-code")
def login_by_code(email: str, code: str):
    # 1. 取存储的验证码
    saved = redis.get(f"verify:login:{email}")
    if not saved:
        raise HTTPException(400, "验证码已过期")

    # 2. 比对
    if saved != code:
        raise HTTPException(400, "验证码错误")

    # 3. 用后即焚
    redis.delete(f"verify:login:{email}")

    # 4. 生成登录态
    token = create_jwt(email)
    return {"token": token}
```

### 8.4 关键安全措施（必须做）

| 措施 | 说明 |
| :--- | :--- |
| **频率限制** | 同一邮箱 60 秒一次；同一 IP 每分钟 N 次 |
| **验证码有效期** | 10 分钟，过期即失效 |
| **用后即焚** | 验证成功立即删除，防止重放 |
| **错误次数限制** | 同一验证码最多尝试 5 次，超出后强制失效 |
| **验证码长度** | 6 位数字足够（100 万种组合 + 次数限制） |
| **HTTPS 必须** | 登录接口必须走 HTTPS，防止中间人窃取 |
| **日志脱敏** | 日志中不要打印明文验证码和 API Key |
| **黑名单** | 识别临时邮箱域名（如 `10minutemail.com`）并拒绝 |

### 8.5 邮件内容优化建议

当前 HTML 模板已经可用，后续可增强：

- 加入**网站 Logo** 图片（用 CDN 链接）
- 加入**"如果非本人操作请忽略"** 提示
- 显示**请求 IP 归属地**（增强安全感）
- 提供**一键复制**按钮（部分邮箱客户端支持）

---

## 九、测试用例清单

| 场景 | 预期结果 |
| :--- | :--- |
| 正常发送验证码 | 收到邮件，状态 `200` |
| 60 秒内重复发送 | 返回 `429`，不消耗额度 |
| 使用过期验证码登录 | 返回 `400` |
| 使用错误验证码 5 次 | 验证码失效 |
| 未验证域名前发往其他邮箱 | Resend 返回 `403` |
| API Key 无效 | Resend 返回 `401` |

---

## 十、常见问题（FAQ）

**Q1：本地能发，服务器发不出去？**  
A：99% 是环境变量没读到。检查服务器上 `echo $RESEND_API_KEY` 是否有输出。

**Q2：QQ 邮箱收不到邮件？**  
A：先查垃圾邮件；其次确认发件域名 DKIM/SPF 验证通过；最后可以在 QQ 邮箱里把 `noreply@lankhub.xyz` 加白名单。

**Q3：Resend 返回 403 "You can only send testing emails..."？**  
A：说明域名未验证，或 `from` 地址不属于已验证域名。检查 Resend Dashboard 的 Domains 页面。

**Q4：免费额度够用吗？**  
A：100 封/天、3000 封/月，对个人网站登录系统完全够用。注意**多收件人按多封计费**。

**Q5：为什么验证码要在服务端生成？**  
A：前端生成可被用户篡改，攻击者可以绕过校验。**验证码必须由后端生成、后端存储、后端校验**，前端只是"搬运工"。

---

## 十一、后续可扩展方向

- [ ] 引入 **HTML 邮件模板引擎**（如 Jinja2），把邮件内容与代码分离
- [ ] 使用 **异步发送**（`resend.Emails.send_async`），避免阻塞 Web 请求
- [ ] 增加 **发送日志表**，便于排查问题和统计
- [ ] 支持 **多语言邮件**（中文 / 英文根据用户区域）
- [ ] 提供 **SMTP 备用通道**，Resend 故障时自动切换（如阿里云邮件推送）

---

## 十二、相关资源

| 资源 | 链接 |
| :--- | :--- |
| Resend 官方文档 | https://resend.com/docs |
| Resend Python SDK | https://github.com/resend/resend-python |
| Resend Dashboard | https://resend.com/emails |
| 阿里云云解析 DNS | https://dns.console.aliyun.com |
| public-apis 仓库 | https://github.com/public-apis/public-apis |

---

**文档维护人**：lank  
**最后验证时间**：2026-10-13  
**验证状态**：✅ 域名已通过 Resend 全部验证，邮件发送测试成功

---