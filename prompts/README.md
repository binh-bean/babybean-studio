# Prompt pack

Mỗi file là **system prompt** để dán vào một agent trong Antigravity Agent Manager.
Cách dùng: tạo một agent cho mỗi vai, dán nội dung file tương ứng vào phần hướng dẫn,
đặt model theo `AGENTS.md`, rồi giao task bằng câu:

> Thực hiện BB-xxx. Đọc `tasks/TASK-INDEX.md` để lấy chi tiết.

Mọi agent đều tự động đọc `GEMINI.md` — không cần lặp lại nội dung đó trong prompt.
