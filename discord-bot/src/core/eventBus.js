const { EventEmitter } = require("events");

class AurixEventBus extends EventEmitter {
  publish(type, payload = {}) {
    const event = {
      type,
      payload,
      createdAt: new Date(),
    };
    this.emit(type, event);
    this.emit("*", event);
    return event;
  }

  subscribe(type, handler) {
    this.on(type, handler);
    return () => this.off(type, handler);
  }
}

const eventBus = new AurixEventBus();
eventBus.setMaxListeners(100);

module.exports = { eventBus };
