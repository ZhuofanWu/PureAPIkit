# 数据存储设计草案

## 1. 推荐文件布局

建议把可移植数据全部放在 exe 同级 `data/` 目录下，先拆成两个库：

```text
PureAPIkit.exe
data/
  workspace.db
  history.db
```

- `workspace.db`：项目、文件夹、接口定义、测试用例、前后置请求编排。
- `history.db`：执行历史。单独拆库，避免历史膨胀拖慢工作区查询，也方便以后单独清理历史。

如果后面要做导入导出或附件缓存，再在 `data/` 下追加子目录，不建议一开始再拆第三个库。

## 2. 总体建模原则

- 核心层级关系使用关系表：`项目 -> 文件夹 -> 接口 -> 测试用例`。
- 强有序列表统一使用 `sort_index INTEGER`，并采用稀疏整数，例如 `1000, 2000, 3000`，降低拖拽排序时的批量更新次数。
- 主键统一使用 `TEXT`，推荐 `ULID` 或 `UUIDv7`，本地生成即可，不依赖数据库自增。
- 时间统一使用 `INTEGER` 存 Unix epoch 毫秒。
- 请求的可执行内容不要完全拆成大量子表；更推荐“列表字段单独列出，复杂请求结构放 JSON”。
- 历史记录中不要依赖工作区库的外键，因为 `history.db` 与 `workspace.db` 分离后无法做跨库外键约束，历史表应保存来源 ID 和名称快照。

## 3. 为什么不建议把请求结构完全拆成子表

如果把 `headers`、`query`、`body`、`auth`、`cookies`、`multipart`、`前后置变量` 全部拆成子表，后面会有三个问题：

- 测试用例会和接口定义重复建一套结构，表数量和联表复杂度会迅速膨胀。
- 历史记录需要保存“执行时快照”，最后还是会再复制一份完整结构。
- 后面新增 body 模式、鉴权方式、变量替换策略时，迁表成本很高。

更稳妥的方式是：

- `requests` 表存接口的基础信息和一份基础请求模板 `request_template_json`。
- `request_cases` 表存测试用例的覆盖层 `request_override_json`。
- 实际执行时：`基础模板 + 测试用例覆盖 + 运行时变量注入 = 最终请求快照`。

这样核心对象仍是结构化的，但请求细节保持足够灵活。

## 4. workspace.db

### 4.1 `schema_migrations`

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);
```

### 4.2 `app_settings`

全局设置不多时可直接用键值表。

```sql
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

可放：

- 最近打开的项目 ID
- 历史保留策略
- 编辑器设置
- 窗口布局

### 4.3 `projects`

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_index INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_projects_sort
  ON projects(sort_index);
```

### 4.4 `folders`

文件夹不支持嵌套，所以不需要 `parent_id`。

```sql
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_index INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_folders_project
  ON folders(project_id);

CREATE UNIQUE INDEX idx_folders_project_sort
  ON folders(project_id, sort_index);

CREATE UNIQUE INDEX idx_folders_project_name
  ON folders(project_id, name);
```

### 4.5 `requests`

这里的“接口”本质上是一个可编辑、可执行的请求定义。

```sql
CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_index INTEGER NOT NULL,
  request_template_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE INDEX idx_requests_folder
  ON requests(folder_id);

CREATE UNIQUE INDEX idx_requests_folder_sort
  ON requests(folder_id, sort_index);

CREATE INDEX idx_requests_method
  ON requests(method);
```

建议把 `method`、`url` 单独放列里，便于列表渲染、筛选和搜索；完整请求模板仍放在 `request_template_json`。

`request_template_json` 建议至少覆盖这些字段：

```json
{
  "method": "POST",
  "url": "https://api.example.com/login",
  "headers": [
    { "id": "hdr_1", "name": "Content-Type", "value": "application/json", "enabled": true }
  ],
  "query": [],
  "path_params": [],
  "body": {
    "mode": "json",
    "text": "{\"username\":\"demo\",\"password\":\"123456\"}"
  },
  "auth": {
    "type": "none",
    "config": {}
  },
  "options": {
    "timeout_ms": 30000,
    "follow_redirects": true,
    "verify_tls": true
  }
}
```

### 4.6 `request_cases`

一个接口可以有多套默认测试用例。建议测试用例存“覆盖层”而不是完整拷贝。

```sql
CREATE TABLE request_cases (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_index INTEGER NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  request_override_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
);

CREATE INDEX idx_request_cases_request
  ON request_cases(request_id);

CREATE UNIQUE INDEX idx_request_cases_request_sort
  ON request_cases(request_id, sort_index);

CREATE UNIQUE INDEX idx_request_cases_default
  ON request_cases(request_id, is_default)
  WHERE is_default = 1;
```

`request_override_json` 不建议做“细粒度 patch 语义”，建议直接做“字段级整段替换”，例如：

```json
{
  "headers": [
    { "id": "hdr_1", "name": "Content-Type", "value": "application/json", "enabled": true }
  ],
  "body": {
    "mode": "json",
    "text": "{\"username\":\"wrong\",\"password\":\"wrong\"}"
  }
}
```

这样接口基础 URL 或公共 Header 变化时，大多数测试用例会自动继承，不会产生大量重复编辑。

### 4.7 `request_hooks`

用于前序/后续请求。先不要一上来做完整工作流引擎，先做线性 hook 模型更稳。

```sql
CREATE TABLE request_hooks (
  id TEXT PRIMARY KEY,
  owner_request_id TEXT NOT NULL,
  hook_type TEXT NOT NULL,
  sort_index INTEGER NOT NULL,
  target_request_id TEXT NOT NULL,
  target_case_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  continue_on_error INTEGER NOT NULL DEFAULT 0,
  inherit_target_hooks INTEGER NOT NULL DEFAULT 0,
  request_override_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (owner_request_id) REFERENCES requests(id) ON DELETE CASCADE,
  FOREIGN KEY (target_request_id) REFERENCES requests(id) ON DELETE RESTRICT,
  FOREIGN KEY (target_case_id) REFERENCES request_cases(id) ON DELETE SET NULL
);

CREATE INDEX idx_request_hooks_owner
  ON request_hooks(owner_request_id, hook_type, sort_index);
```

字段说明：

- `hook_type`：`pre` / `post`
- `owner_request_id`：当前接口本身
- `target_request_id`：被调用的前后置接口
- `target_case_id`：调用它时选用的测试用例，可为空
- `inherit_target_hooks`：默认建议为 `0`，避免鉴权接口自身再触发自己的 hook 造成递归
- `request_override_json`：仅对这一次 hook 调用生效的覆盖层

这里还有一个数据库层不容易直接保证的约束：`target_case_id` 必须真实隶属于 `target_request_id`，这一点建议在 Rust 侧保存时校验。

### 4.8 `request_hook_extractors`

前序请求通常要把 token、cookie、userId 等提取到运行时上下文。

```sql
CREATE TABLE request_hook_extractors (
  id TEXT PRIMARY KEY,
  hook_id TEXT NOT NULL,
  sort_index INTEGER NOT NULL,
  var_name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_expr TEXT NOT NULL,
  default_value TEXT,
  required INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (hook_id) REFERENCES request_hooks(id) ON DELETE CASCADE
);

CREATE INDEX idx_request_hook_extractors_hook
  ON request_hook_extractors(hook_id, sort_index);

CREATE UNIQUE INDEX idx_request_hook_extractors_name
  ON request_hook_extractors(hook_id, var_name);
```

建议先支持这些提取类型：

- `json_pointer`：从 JSON 响应体中提取，最容易在 Rust 稳定实现
- `header`
- `cookie`
- `regex`
- `status`

运行时变量名建议允许点号命名，例如 `auth.token`、`auth.refresh_token`。

### 4.9 可选预留：`project_variables`

如果后面要支持多环境、共享变量、密钥管理，可以加这张表。不是当前必须，但很快会用到。

```sql
CREATE TABLE project_variables (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  is_secret INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_project_variables_name
  ON project_variables(project_id, name);
```

建议运行时变量覆盖优先级：

1. `project_variables`
2. `request_cases` 中的覆盖内容
3. 前序 hook 提取出的变量

## 5. history.db

### 5.1 `schema_migrations`

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);
```

### 5.2 `history_runs`

一次用户点击“发送”，算一个 run。哪怕里面包含前序/后续请求，也归到同一个 run。

```sql
CREATE TABLE history_runs (
  id TEXT PRIMARY KEY,
  root_project_id TEXT,
  root_folder_id TEXT,
  root_request_id TEXT,
  root_case_id TEXT,
  root_request_name TEXT NOT NULL,
  root_case_name TEXT NOT NULL DEFAULT '',
  trigger_type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  duration_ms INTEGER,
  runtime_context_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT
);

CREATE INDEX idx_history_runs_started
  ON history_runs(started_at DESC);

CREATE INDEX idx_history_runs_request
  ON history_runs(root_request_id, started_at DESC);
```

字段说明：

- `trigger_type`：`manual` / `retry` / `hooked`
- `status`：`success` / `partial_success` / `failed`
- `runtime_context_json`：本次运行结束后持有的变量快照，方便调试 token 提取是否成功

### 5.3 `history_steps`

一个 run 里的每一次实际 HTTP 调用都记成一步。

```sql
CREATE TABLE history_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  step_kind TEXT NOT NULL,
  source_request_id TEXT,
  source_case_id TEXT,
  source_request_name TEXT NOT NULL,
  source_case_name TEXT NOT NULL DEFAULT '',
  resolved_request_json TEXT NOT NULL,
  response_status INTEGER,
  response_status_text TEXT NOT NULL DEFAULT '',
  response_headers_json TEXT NOT NULL DEFAULT '{}',
  response_body_blob BLOB,
  response_content_type TEXT NOT NULL DEFAULT '',
  response_size_bytes INTEGER NOT NULL DEFAULT 0,
  extracted_vars_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  duration_ms INTEGER,
  FOREIGN KEY (run_id) REFERENCES history_runs(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_history_steps_run_order
  ON history_steps(run_id, step_order);

CREATE INDEX idx_history_steps_request
  ON history_steps(source_request_id, started_at DESC);
```

字段说明：

- `step_kind`：`pre` / `main` / `post`
- `resolved_request_json`：已经应用模板、测试用例、变量替换后的最终请求快照
- `response_body_blob`：避免二进制响应丢失
- `extracted_vars_json`：本步骤提取出的变量，便于定位前序链路问题

## 6. 一次执行的推荐流程

1. 读取 `requests.request_template_json`
2. 叠加 `request_cases.request_override_json`
3. 读取 `project_variables`
4. 依次执行 `pre` hooks
5. 每个前序 hook 执行后，根据 `request_hook_extractors` 把结果写入运行时上下文
6. 用运行时上下文替换主请求中的占位符，例如 `{{auth.token}}`
7. 执行主请求
8. 执行 `post` hooks
9. 写入 `history_runs` 与 `history_steps`

## 7. 额外实现建议

- SQLite 打开后立刻设置：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```

- 排序字段不要直接用连续整数 `1,2,3`，建议每次插入间隔 1000。
- 删除接口时，`workspace.db` 走外键级联；`history.db` 不删历史，只保留来源 ID 和名称快照。
- hook 图需要在应用层做环检测，禁止 A 依赖 B，B 又回调 A。
- 大响应体建议后续加“历史裁剪策略”，例如只保留最近 N 天或 N 条。

## 8. 结论

如果按当前需求收敛，我建议首版就落下面这组核心表：

- `projects`
- `folders`
- `requests`
- `request_cases`
- `request_hooks`
- `request_hook_extractors`
- `history_runs`
- `history_steps`

这套模型足够支撑：

- 多项目
- 单层文件夹
- 接口强有序
- 一个接口多测试用例
- 前序/后续请求
- token 等变量提取
- 单独的历史库

同时也没有把 schema 做成以后难以迁移的“半个工作流引擎”。
