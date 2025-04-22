# syntax = docker/dockerfile:1

# Use an official Node.js image
FROM node:18-slim AS base

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"

# Install dependencies
COPY package.json package-lock.json ./
RUN npm install --production

# Copy application code
COPY . .

# Expose the port Fly.io will use
EXPOSE 3000

# Start the server
CMD ["node", "dist/api/index.js"]
