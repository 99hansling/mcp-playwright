import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleToolCall } from './toolHandler.js';
import { createToolDefinitions } from './tools.js';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 创建虚拟MCP服务器实例用于工具调用
const mockServer = new Server(
  {
    name: "executeautomation/playwright-mcp-server",
    version: "1.0.3",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

// 创建Express应用
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 健康检查端点
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'MCP Playwright Server is running' });
});

// 修改API端点，使用实际的Playwright功能处理请求
app.post('/api/command', async (req, res) => {
  try {
    const { prompt, url, options } = req.body;
    
    // 验证必要参数
    if (!prompt) {
      return res.status(400).json({ 
        status: 'error', 
        message: '缺少必要参数: prompt' 
      });
    }
    
    console.log(`处理命令请求: URL=${url}, Prompt=${prompt.substring(0, 100)}...`);
    
    // 使用navigate工具来访问URL并获取内容
    const startTime = Date.now();
    const result = await handleToolCall('playwright_navigate', {
      url: url,
      waitUntil: options?.waitUntil || 'networkidle',
      browserType: 'chromium',
      headless: true,
      width: 1280,
      height: 720
    }, mockServer);
    
    // 获取页面HTML内容
    const htmlResult = await handleToolCall('playwright_get_visible_html', {}, mockServer);
    let content = '';
    
    // 从结果中提取HTML内容
    if (htmlResult && htmlResult.content && htmlResult.content.length > 0) {
      content = htmlResult.content[0].text;
    }
    
    // 关闭浏览器以释放资源
    await handleToolCall('playwright_close', {}, mockServer);
    
    const executionTime = Date.now() - startTime;
    
    // 返回结果
    return res.json({
      status: 'success',
      executionTime,
      content,
      prompt
    });
  } catch (error: any) {
    console.error('命令处理错误:', error);
    res.status(500).json({
      status: 'error',
      message: `命令执行失败: ${error.message || '未知错误'}`,
      error: error.stack || '无堆栈信息'
    });
  }
});

// 启动原始MCP服务器作为子进程
const mcpProcess = spawn('node', [path.join(__dirname, 'index.js')], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env }
});

console.log('MCP服务器子进程已启动');

mcpProcess.stdout.on('data', (data) => {
  console.log(`MCP输出: ${data}`);
});

mcpProcess.stderr.on('data', (data) => {
  console.error(`MCP错误: ${data}`);
});

// 启动HTTP服务器
// 修正后的代码 - 强制转换为数字
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`HTTP服务器运行在 http://0.0.0.0:${port}`);
});
