/**
 * Thin compatibility wrapper for local host log helpers.
 * The provider implementation lives in `services/hostLogs/localProvider.ts`.
 */
export {
  LOCAL_HOST_ID,
  getNginxLogDir,
  getNginxAccessFile,
  getNginxErrorFile,
  getPm2LogDir,
  getPm2AppName,
  parsePm2Apps,
  pm2AppSourceSlug,
  isSelfContainerEnabled,
  newestPm2Log,
  newestPm2LogAsync,
  resolveHostLogs,
  resolveHostLogsAsync,
  isReadable,
  isReadableAsync,
} from "../services/hostLogs/localProvider";
