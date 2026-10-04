"use client";

import { useMemo, useState } from "react";
import { Button, Modal, Select, Switch, Table, Upload } from "antd";
import type { UploadFile } from "antd";
import { FileUp } from "lucide-react";
import * as XLSX from "xlsx";
import { api, useMessage } from "@/lib/client";

type ImportRow = { name: string; no: string; groupName: string; sex: number; balance: number };

// Self-contained import flow: trigger button, file parsing states and the modal.
export function ImportDialog({ classId, onImported }: { classId: string; onImported: () => void }) {
  const { message, notifyError } = useMessage();
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importRawRows, setImportRawRows] = useState<unknown[][]>([]);
  const [importHeader, setImportHeader] = useState(true);
  const [importOnDuplicate, setImportOnDuplicate] = useState<"skip" | "overwrite">("skip");
  const [importFiles, setImportFiles] = useState<UploadFile[]>([]);
  const importRows = useMemo<ImportRow[]>(() => {
    const dataRows = importHeader ? importRawRows.slice(1) : importRawRows;
    return dataRows.flatMap(row => {
      const name = String(row[0] ?? "").trim();
      if (!name) return [];
      const sexText = String(row[3] ?? "").trim();
      const balanceText = String(row[4] ?? "").trim();
      return [
        {
          name,
          no: String(row[1] ?? "").trim(),
          groupName: String(row[2] ?? "").trim(),
          sex: sexText === "男" ? 1 : sexText === "女" ? 2 : 0,
          balance: /^-?\d+$/.test(balanceText) ? Number(balanceText) : 0,
        },
      ];
    });
  }, [importRawRows, importHeader]);
  const duplicateNames = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const row of importRows) {
      if (seen.has(row.name)) duplicates.add(row.name);
      seen.add(row.name);
    }
    return [...duplicates];
  }, [importRows]);
  async function readImportFile(file: File) {
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      setImportRawRows(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false }));
    } catch {
      setImportRawRows([]);
      message.error("文件解析失败，请确认是有效的 Excel 文件");
      return Upload.LIST_IGNORE;
    }
    return false;
  }
  function closeImport() {
    setOpen(false);
    setImportRawRows([]);
    setImportFiles([]);
    setImportHeader(true);
    setImportOnDuplicate("skip");
  }
  async function submitImport() {
    if (!importRows.length) {
      message.warning("请先上传包含学生数据的文件");
      return;
    }
    if (duplicateNames.length) {
      message.error(`文件内存在重复姓名：${duplicateNames.join("、")}`);
      return;
    }
    setImporting(true);
    try {
      const result = await api<{ created: number; updated: number; skipped: number }>(
        `/api/admin/classes/${classId}/students`,
        {
          method: "POST",
          body: JSON.stringify({ action: "import", rows: importRows, onDuplicate: importOnDuplicate }),
        },
      );
      message.success(`导入完成：新增 ${result.created} 人，更新 ${result.updated} 人，跳过 ${result.skipped} 人`);
      closeImport();
      onImported();
    } catch (err) {
      notifyError(err, "导入失败");
    } finally {
      setImporting(false);
    }
  }
  return (
    <>
      <Button type="primary" icon={<FileUp size={16} />} onClick={() => setOpen(true)}>
        Excel 导入
      </Button>
      <Modal
        title="批量导入学生"
        open={open}
        onCancel={closeImport}
        onOk={submitImport}
        okText="确认"
        cancelText="取消"
        confirmLoading={importing}
        closable={!importing}
        keyboard={!importing}
        maskClosable={!importing}
        cancelButtonProps={{ disabled: importing }}
        width={640}
      >
        <div style={{ marginBottom: 22 }}>
          <h4 style={{ margin: "0 0 9px" }}>格式说明</h4>
          <p className="muted" style={{ margin: "0 0 10px" }}>
            文件列顺序为：姓名、学号、组别、性别、余额。
          </p>
          <div className="import-example">
            <Table
              size="small"
              showHeader={importHeader}
              pagination={false}
              rowKey="name"
              dataSource={[
                { name: "张三", no: "20250101", groupName: "第一组", sex: "男", balance: 12 },
                { name: "李四", no: "20250102", groupName: "第一组", sex: "女", balance: 8 },
                { name: "王五", no: "", groupName: "", sex: "", balance: 0 },
              ]}
              columns={[
                { title: "姓名", dataIndex: "name" },
                { title: "学号（可留空）", dataIndex: "no" },
                { title: "组别（可留空）", dataIndex: "groupName" },
                { title: "性别（可留空）", dataIndex: "sex" },
                { title: "余额（可留空）", dataIndex: "balance" },
              ]}
            />
          </div>
        </div>
        <div style={{ marginBottom: 22 }}>
          <h4 style={{ margin: "0 0 9px" }}>上传文件</h4>
          <Upload
            accept=".xlsx,.xls"
            maxCount={1}
            fileList={importFiles}
            beforeUpload={readImportFile}
            onChange={({ fileList }) => setImportFiles(fileList.slice(-1))}
            onRemove={() => {
              setImportFiles([]);
              setImportRawRows([]);
            }}
          >
            <Button type="primary" icon={<FileUp size={15} />}>
              选择文件
            </Button>
          </Upload>
        </div>
        <div>
          <h4 style={{ margin: "0 0 9px" }}>解析配置</h4>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 9 }}>
            <Switch checked={importHeader} onChange={setImportHeader} />
            <span>我上传的文件含有表头行，当已有同名学生时</span>
            <Select<"skip" | "overwrite">
              value={importOnDuplicate}
              onChange={setImportOnDuplicate}
              style={{ width: 110 }}
              options={[
                { value: "skip", label: "跳过" },
                { value: "overwrite", label: "覆盖" },
              ]}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
