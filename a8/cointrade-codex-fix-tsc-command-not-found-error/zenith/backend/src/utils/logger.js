const LEVELS = ['debug', 'info', 'warn', 'error'];

function serializeContext(context) {
  return JSON.stringify(context, (_key, value) => {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }
    return value;
  });
}

function format({ level, message, context }) {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (!context || Object.keys(context).length === 0) {
    return base;
  }
  return `${base} ${serializeContext(context)}`;
}

function emit(level, message, context) {
  if (!LEVELS.includes(level)) {
    level = 'info';
  }
  const line = format({ level, message, context });
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug(context, message) {
    if (typeof context === 'string') {
      emit('debug', context);
      return;
    }
    emit('debug', message ?? '', context);
  },
  info(context, message) {
    if (typeof context === 'string') {
      emit('info', context);
      return;
    }
    emit('info', message ?? '', context);
  },
  warn(context, message) {
    if (typeof context === 'string') {
      emit('warn', context);
      return;
    }
    emit('warn', message ?? '', context);
  },
  error(context, message) {
    if (typeof context === 'string') {
      emit('error', context);
      return;
    }
    emit('error', message ?? '', context);
  },
};
