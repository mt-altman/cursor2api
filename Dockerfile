FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 安装依赖
RUN npm install --production

# 复制源代码
COPY . .

# 设置适当的权限
RUN chown -R node:node /app

# 切换到非root用户
USER node

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "src/index.js"] 