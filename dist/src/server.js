"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = void 0;
const formbody_1 = __importDefault(require("@fastify/formbody"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
const fastify_1 = __importDefault(require("fastify"));
const createServer = () => {
    const server = (0, fastify_1.default)();
    server.register(formbody_1.default);
    server.register(websocket_1.default);
    return server;
};
exports.createServer = createServer;
