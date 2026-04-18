import { describe, expect, it } from "vitest";

import { resolveStatusBarGateway } from "./StatusBar.utils";

describe("resolveStatusBarGateway", () => {
  it("preserve un gateway explicite down", () => {
    expect(
      resolveStatusBarGateway({
        last_tick_time: null,
        kill_switch: false,
        close_all: false,
        autostart_disabled: false,
        trading_paused: false,
        bot_running: true,
        last_log: null,
        gateway_connected: false,
      })
    ).toBe(false);
  });

  it("retourne unknown quand le service n est pas encore verifie", () => {
    expect(
      resolveStatusBarGateway({
        last_tick_time: null,
        kill_switch: false,
        close_all: false,
        autostart_disabled: false,
        trading_paused: false,
        bot_running: true,
        last_log: null,
        service_checked: false,
      })
    ).toBeNull();
  });

  it("retombe sur bot_running seulement quand aucun etat gateway explicite n existe", () => {
    expect(
      resolveStatusBarGateway({
        last_tick_time: null,
        kill_switch: false,
        close_all: false,
        autostart_disabled: false,
        trading_paused: false,
        bot_running: true,
        last_log: null,
        service_checked: true,
      })
    ).toBe(true);
  });

  it("utilise le health imbrique si le champ plat est absent", () => {
    expect(
      resolveStatusBarGateway({
        last_tick_time: null,
        kill_switch: false,
        close_all: false,
        autostart_disabled: false,
        trading_paused: false,
        bot_running: null,
        last_log: null,
        health: {
          gateway_connected: true,
          data_fresh: true,
          trading_blocked: false,
          block_reason: null,
        },
      })
    ).toBe(true);
  });
});
