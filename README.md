# chat-memory-bridge
这是一个名为 chat-memory-bridge 的技能，用来把一段完整对话（含思考过程）抓取下来、按重要性提纯成长期记忆母本，并与上一次的记忆 md 合并，只增不重写，解决长对话被压缩后细节全丢、人设漂移、AI 失忆的问题。
我知道有很多（和我一样属于破产阶级的）朋友在诸如deepseek app端等软件上与ai进行的（免费）交流会受到上下文的限制，所以做出这个skill以帮助chat bot继续之前的对话（注：仅用于app聊天记录的接续，无法读取文件，会对原来的记忆进行提纯）
把 AI 长对话抓取、按重要性提纯成记忆母本，下一次开新会话直接喂回去——让压缩后的对话不只是「记得」，而是还原得回来。Capture an AI conversation, distill it into a portable memory seed, and feed it back into your next session — so compression keeps the person, not just the facts.

##将下面这段话发给你的agent即可：
帮我安装一个技能（skill）
请按以下步骤执行：
1. 把 https://github.com/woxinfeishi596/chat-memory-bridge 取到本地，得到一个 chat-memory-bridge 目录（里面有 SKILL.md、README.md、scripts/、references/、assets/、tests/）。
2. 先读 README.md 和 SKILL.md，确认你所在客户端要求的技能安装位置和目录结构（通常是把整个目录放进你的 skills 目录，且 SKILL.md 位于该目录根部、保留其 YAML frontmatter 的 name 和 description 字段）。
3. 把整个目录原样放进去，不要改文件名、不要拆散 scripts/ references/ assets/ 这些子目录，技能内部靠相对路径引用它们。
4. 检查环境：自动抓取路线需要 Node.js 22+，脚本零第三方依赖；如果我的版本不够，告诉我，我走手动粘贴对话的路线也行。
5. 装完请验证：一是确认你已能在技能列表里识别到 chat-memory-bridge，二是运行仓库里的离线冒烟测试（读 README.md 找命令，例如 node tests/smoke.mjs）确认脚本能跑通，不要联网、不要真的抓取我的聊天记录。
6. 最后用一句话告诉我：装在哪、是否验证通过、以及我接下来该怎么触发它（比如我对你说"把这段聊天记录提纯成记忆"或"接续上次记忆"时，你会怎么走流程）。
过程中如果需要我确认路径或权限，直接问我，不要自己猜。
