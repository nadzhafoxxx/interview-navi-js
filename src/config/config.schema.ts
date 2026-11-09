import { Type, type Static } from "@sinclair/typebox";

const LogLevelSchema = Type.Union(
  [
    Type.Literal("error"),
    Type.Literal("warn"),
    Type.Literal("info"),
    Type.Literal("http"),
    Type.Literal("verbose"),
    Type.Literal("debug"),
    Type.Literal("silly"),
  ],
  { default: "info" },
);

export const ConfigSchema = Type.Object({
  api: Type.Optional(
    Type.Object({
      cors: Type.Array(Type.String(), { default: ["*"] }),
    }),
  ),
  services: Type.Object({
    dashboard: Type.Object({
      port: Type.Integer({ minimum: 1, maximum: 65535 }),
      host: Type.Optional(Type.String({ default: "0.0.0.0" })),
    }),
  }),
  database: Type.Object({
    path: Type.String(),
    bootstrap: Type.Object({
      schema: Type.String(),
      seed: Type.String(),
    }),
  }),
  logs: Type.Object({
    level: LogLevelSchema,
  }),
  requestTimeoutMs: Type.Integer({ minimum: 1, default: 30000 }),
});

export type ConfigSchema = Static<typeof ConfigSchema>;
