# Task Hall Navigation

The task hall is the shared entrypoint for most SJTU portal workflows:

```text
https://my.sjtu.edu.cn/ui/task
```

Observed structure:

```text
Top navigation:
办事 / 应用 / 日程 / 消息 / AI 应用专区

办事 tabs:
服务大厅 / 待办事项 / 已办事项 / 抄送事项

Side shortcuts:
我的收藏 / 最近使用

Service category cards:
电院 / 财务 / 科研 / 智慧党建 / 校园管理 / 生活服务 / 信息服务 / ...
```

## Shared API

Use `src/lib/taskHall.ts` for common browser work:

```ts
const taskHall = await openTaskHall(options);
const categories = await listServiceCategories(taskHall.session.page);
const servicePage = await openServiceCategory(taskHall, "生活服务");
const entryPage = await openServiceEntry(servicePage.page, ["宿舍电费", "电费"], timeoutMs);
await closeTaskHall(taskHall);
```

Do not duplicate this flow inside every business command:

```text
restore auth
open task URL
check AUTH_REQUIRED
wait for visible content
click service category
handle popup/new page
wait for content
```

## Discovery Commands

Use these when exploring a new workflow:

```bash
npm run --silent jaccount -- task open --profile default --json
npm run --silent jaccount -- task categories --profile default --json
npm run --silent jaccount -- task search --keyword 电费 --profile default --json
npm run --silent jaccount -- task category open --name 生活服务 --profile default --json
```

## Business Commands

Business commands should call task hall helpers and then own only their domain-specific steps.

For example, `electricity balance` owns:

```text
find 宿舍电费 / 电费
open electricity recharge page
extract room, balance, remaining kWh, monthly usage
return structured JSON
```

It should not own:

```text
jAccount auth restoration
task hall readiness checks
generic category navigation
generic popup handling
```

`reimbursement open` follows the same pattern:

```text
open 财务
open 智能报销
return reimbursement home URL, title, visible action labels
save finance and reimbursement screenshots
```

It deliberately does not click business actions such as 历史预约单; those should be separate read-only commands.

`reimbursement appointments` is the first such read-only subcommand. It opens 历史预约单 and parses the current jqGrid table into structured records without clicking detail, print, logistics, or bank receipt actions.
