import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App, ConfigProvider } from "antd";
import "./globals.css";

export const metadata: Metadata = {
  title: "榕课堂 | 班级积分管理",
  description: "面向初级教育教师的班级积分管理平台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>
          <ConfigProvider
            theme={{
              token: {
                colorPrimary: "#176b5d",
                colorInfo: "#176b5d",
                colorInfoBg: "#e4f2ed",
                colorInfoBorder: "#bcd9cf",
                borderRadius: 6,
                fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
              },
            }}
          >
            <App component={false}>{children}</App>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
