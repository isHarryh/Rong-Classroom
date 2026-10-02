# Rong-Classroom

Rong Classroom: Classroom Credits Platform for Junior Education  
榕课堂：用于初级教育的班级积分平台

## 技术栈

- Next.js App Router + React + TypeScript
- Ant Design
- SQLite（`better-sqlite3`）
- Excel 导入与导出（SheetJS）

## 本地运行

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:3000`。首次启动会自动创建 `data/rong-classroom.db`。超级管理员账号完全由 `ADMIN_USERNAME`、`ADMIN_PASSWORD`、`ADMIN_NAME` 环境变量决定，不写入数据库。

完整环境变量示例见 [`.env.example`](.env.example)。部署前请修改关键变量，并在 HTTPS 部署时设置 `COOKIE_SECURE=true`。

生产构建：

```bash
pnpm build
pnpm start
```

## 页面

- `/`：按登录状态分发到管理端、教室端或登录页
- `/login`：教师管理端与教室设备端登录
- `/admin`：数据看板
- `/admin/classes`：班级管理
- `/admin/classes/{uuid}`：班级详情（学生、组别、积分记录与 Excel 导入导出）
- `/admin/settings`：全局加减分原因
- `/admin/clients`：教室设备凭据
- `/admin/accounts`：超级管理员专属的教师账号管理
- `/client`：教室端学生列表和加减分操作
