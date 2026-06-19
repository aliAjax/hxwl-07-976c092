#!/usr/bin/env node
/* eslint-disable no-console */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  try {
    return execSync(cmd, {
      cwd: ROOT,
      stdio: opts.silent ? "pipe" : "inherit",
      encoding: "utf-8",
      ...opts,
    });
  } catch (e) {
    if (opts.ignoreError) return e.stdout || "";
    throw e;
  }
}

function section(title) {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function checkmark(pass) {
  return pass ? "✓" : "✗";
}

const results = [];

function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  const status = pass ? "PASS" : "FAIL";
  const color = pass ? "\x1b[32m" : "\x1b[31m";
  const reset = "\x1b[0m";
  console.log(`${color}${checkmark(pass)} [${status}]${reset} ${name}${detail ? ` - ${detail}` : ""}`);
}

function validateServiceWorker() {
  section("验证 Service Worker 文件");

  const swPath = path.join(ROOT, "public", "sw.js");
  const exists = fs.existsSync(swPath);
  record("sw.js 文件存在", exists);
  if (!exists) return;

  const content = fs.readFileSync(swPath, "utf-8");

  const hasInstall = /addEventListener\s*\(\s*['"]install['"]/.test(content);
  record("install 事件监听器", hasInstall);

  const hasActivate = /addEventListener\s*\(\s*['"]activate['"]/.test(content);
  record("activate 事件监听器", hasActivate);

  const hasFetch = /addEventListener\s*\(\s*['"]fetch['"]/.test(content);
  record("fetch 事件监听器", hasFetch);

  const hasMessage = /addEventListener\s*\(\s*['"]message['"]/.test(content);
  record("message 事件监听器", hasMessage);

  const hasSync = /addEventListener\s*\(\s*['"]sync['"]/.test(content);
  record("sync 事件监听器（后台同步）", hasSync);

  const hasCacheVersion = /CACHE_VERSION|cacheVersion/.test(content);
  record("缓存版本号定义", hasCacheVersion);

  const hasPrecache = /PRECACHE_URLS|precache|preCache|urlsToCache/.test(content);
  record("预缓存资源列表", hasPrecache);

  const hasSkipWaiting = /skipWaiting/.test(content);
  record("skipWaiting 调用", hasSkipWaiting);

  const hasClientsClaim = /clients\.claim/.test(content);
  record("clients.claim 调用", hasClientsClaim);

  const hasCacheStrategy = /cache\.match|caches\.match|networkFirst|cacheFirst/.test(content);
  record("缓存策略实现", hasCacheStrategy);

  const hasOfflineFallback = /offline\.html|fallback/.test(content);
  record("离线回退页面", hasOfflineFallback);

  const hasCacheCleanup = /cache\.delete|caches\.delete/.test(content);
  record("旧缓存清理逻辑", hasCacheCleanup);
}

function validateOfflineModule() {
  section("验证离线模块 (offline.ts)");

  const offlinePath = path.join(ROOT, "src", "offline.ts");
  const exists = fs.existsSync(offlinePath);
  record("offline.ts 文件存在", exists);
  if (!exists) return;

  const content = fs.readFileSync(offlinePath, "utf-8");

  const hasNetworkMonitor = /initNetworkMonitoring|networkStatus|onLine/.test(content);
  record("网络状态监控", hasNetworkMonitor);

  const hasSyncQueue = /syncQueue|SyncOperation|enqueueOperation/.test(content);
  record("同步队列实现", hasSyncQueue);

  const hasAutoSync = /attemptAutoSync|syncImmediate|autoSync/.test(content);
  record("自动同步逻辑", hasAutoSync);

  const hasSWRegister = /registerServiceWorker|serviceWorker\.register/.test(content);
  record("Service Worker 注册", hasSWRegister);

  const hasCacheMgmt = /clearCache|cacheStaticAssets|cacheInfo/.test(content);
  record("缓存管理功能", hasCacheMgmt);

  const hasDedup = /dedup|isOperationProcessed|markOperationProcessed/.test(content);
  record("操作去重机制", hasDedup);

  const hasPersistence = /localStorage|persistSyncQueue|saveSyncQueue/.test(content);
  record("队列持久化", hasPersistence);

  const hasBroadcast = /BroadcastChannel|broadcastEntityUpdate|postMessage/.test(content);
  record("广播通信", hasBroadcast);

  const hasSubscribe = /subscribe|notify|Subscriber/.test(content);
  record("订阅/发布模式", hasSubscribe);
}

function validateSyncModule() {
  section("验证同步模块 (sync.ts)");

  const syncPath = path.join(ROOT, "src", "sync.ts");
  const exists = fs.existsSync(syncPath);
  record("sync.ts 文件存在", exists);
  if (!exists) return;

  const content = fs.readFileSync(syncPath, "utf-8");

  const hasVersioning = /_version|addVersionFields/.test(content);
  record("版本号字段", hasVersioning);

  const hasHash = /contentHash|calculateContentHash|hash/.test(content);
  record("内容哈希计算", hasHash);

  const hasConflict = /detectConflict|conflict|ConflictResult/.test(content);
  record("冲突检测", hasConflict);

  const hasDeepDiff = /deepDiff|diff/.test(content);
  record("深度差异对比", hasDeepDiff);

  const hasTimestamps = /_updatedAt|updatedAt|timestamp/.test(content);
  record("时间戳管理", hasTimestamps);

  const hasOperationId = /_operationId|operationId/.test(content);
  record("操作 ID (幂等)", hasOperationId);
}

function runUnitTests() {
  section("运行离线单元测试");

  try {
    const output = run("npm run test:offline", { silent: true });
    record("离线单元测试全部通过", true);
    const match = output.match(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/);
    if (match) {
      results[results.length - 1].detail = `${match[1]} 个测试通过`;
    }
  } catch (e) {
    record("离线单元测试全部通过", false, "测试失败，详情请见上方输出");
    console.log(e.stdout || e.message);
  }
}

function validateTestFiles() {
  section("验证测试文件");

  const testDir = path.join(ROOT, "tests", "offline");
  const exists = fs.existsSync(testDir);
  record("tests/offline 目录存在", exists);
  if (!exists) return;

  const files = fs.readdirSync(testDir);
  const testFiles = files.filter(f => f.endsWith(".test.ts"));
  record(`测试文件数量 (${testFiles.length})`, testFiles.length >= 3, `${testFiles.length} 个测试文件`);

  const hasSyncTest = files.includes("sync.test.ts");
  record("sync.test.ts 存在", hasSyncTest);

  const hasOfflineStateTest = files.includes("offline-state.test.ts");
  record("offline-state.test.ts 存在", hasOfflineStateTest);

  const hasSWTest = files.includes("service-worker.test.ts");
  record("service-worker.test.ts 存在", hasSWTest);

  const hasTestUtils = files.includes("test-utils.ts");
  record("test-utils.ts 测试工具", hasTestUtils);
}

function validateCIConfig() {
  section("验证 CI 配置");

  const workflowPath = path.join(ROOT, ".github", "workflows", "offline-tests.yml");
  const exists = fs.existsSync(workflowPath);
  record("GitHub Actions 工作流配置", exists);
}

function validateTestPage() {
  section("验证浏览器测试页面");

  const pagePath = path.join(ROOT, "public", "offline-test.html");
  const exists = fs.existsSync(pagePath);
  record("offline-test.html 存在", exists);
}

function validateNodeVersion() {
  section("验证 Node 版本一致性");

  const nvmrcPath = path.join(ROOT, ".nvmrc");
  const hasNvmrc = fs.existsSync(nvmrcPath);
  record(".nvmrc 版本文件存在", hasNvmrc);

  if (!hasNvmrc) return;

  const expectedVersion = fs.readFileSync(nvmrcPath, "utf-8").trim();
  const actualVersion = process.version.replace(/^v/, "");

  const majorMatch = actualVersion.split(".")[0] === expectedVersion.split(".")[0];
  record(
    `Node 主版本一致 (期望 ${expectedVersion}.x, 实际 ${actualVersion})`,
    majorMatch,
    `当前 v${actualVersion}`
  );

  const workflowPath = path.join(ROOT, ".github", "workflows", "offline-tests.yml");
  if (fs.existsSync(workflowPath)) {
    const workflow = fs.readFileSync(workflowPath, "utf-8");
    const hasVersionInCI = workflow.includes(`node-version-file: ".nvmrc"`) ||
                          workflow.includes(`node-version: "${expectedVersion}`) ||
                          workflow.includes(`node-version: [${expectedVersion}`);
    record("CI 配置包含对应 Node 版本", hasVersionInCI);
  }
}

function printSummary() {
  section("测试汇总");

  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  console.log(`\n总计: ${total} 项检查`);
  console.log(`\x1b[32m通过: ${passed}\x1b[0m`);
  console.log(`\x1b[31m失败: ${failed}\x1b[0m`);
  console.log(`通过率: ${((passed / total) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log("\n失败项:");
    results.filter(r => !r.pass).forEach(r => {
      console.log(`  ✗ ${r.name}${r.detail ? ` - ${r.detail}` : ""}`);
    });
  }

  console.log("\n" + "=".repeat(60));
  console.log(failed === 0 ? "  ✅ 所有检查通过！" : "  ❌ 部分检查失败，请查看详情");
  console.log("=".repeat(60));

  process.exit(failed === 0 ? 0 : 1);
}

function main() {
  console.log("\n🧪 离线能力回归检查工具");
  console.log("验证 Service Worker、离线缓存、同步队列等核心功能");

  try {
    validateNodeVersion();
    validateServiceWorker();
    validateOfflineModule();
    validateSyncModule();
    validateTestFiles();
    validateCIConfig();
    validateTestPage();
    runUnitTests();
  } catch (e) {
    console.error("\n运行出错:", e.message);
    process.exit(1);
  }

  printSummary();
}

main();
