import { EventEmitter } from 'events';
import * as net from 'net';

export class VmixConnection extends EventEmitter {
  private socket: net.Socket | null = null;
  private ip: string = '';
  private port: number = 8099;
  private connected: boolean = false;
  private buffer: string = '';
  private lastProgramInput: number = 0;
  private lastPreviewInput: number = 0;
  private tallyState: string = '';
  private waitingForXml: boolean = false;
  private xmlLength: number = 0;
  private xmlBuffer: string = '';
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private pollRateMs: number = 1000; // Poll vMix XML state every 1 second

  connect(ip: string, port: number = 8099): void {
    this.ip = ip;
    this.port = port;

    this.socket = new net.Socket();

    this.socket.on('connect', () => {
      console.log(`[vMix] Connected to ${ip}:${port}`);
      this.connected = true;
      this.emit('connected');

      // Subscribe to tally updates and request initial XML state
      this.send('SUBSCRIBE TALLY\r\n');
      this.send('XML\r\n');

      // Start periodic XML polling as a safety net to catch missed tally updates
      this.startPolling();
    });

    this.socket.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.socket.on('error', (error: Error) => {
      console.error(`[vMix] Connection error:`, error.message);
      this.connected = false;
      this.emit('error', error);
    });

    this.socket.on('close', () => {
      console.log(`[vMix] Disconnected from ${ip}:${port}`);
      this.connected = false;
      this.emit('disconnected');
    });

    this.socket.connect(port, ip);
  }

  disconnect(): void {
    this.stopPolling();
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.buffer = '';
    this.waitingForXml = false;
    this.xmlBuffer = '';
  }

  isConnected(): boolean {
    return this.connected;
  }

  setProgram(input: number): void {
    this.send(`FUNCTION CutDirect Input=${input}\r\n`);
  }

  setPreview(input: number): void {
    this.send(`FUNCTION PreviewInput Input=${input}\r\n`);
  }

  getLastProgramInput(): number {
    return this.lastProgramInput;
  }

  getLastPreviewInput(): number {
    return this.lastPreviewInput;
  }

  requestXmlState(): void {
    this.send('XML\r\n');
  }

  private startPolling(): void {
    this.stopPolling();
    console.log(`[vMix] Starting XML state polling every ${this.pollRateMs}ms`);
    this.pollInterval = setInterval(() => {
      if (this.connected && !this.waitingForXml) {
        this.send('XML\r\n');
      }
    }, this.pollRateMs);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log(`[vMix] Stopped XML state polling`);
    }
  }

  private send(command: string): void {
    if (this.socket && this.connected) {
      this.socket.write(command);
      console.log(`[vMix] Sent: ${command.trim()}`);
    }
  }

  private processBuffer(): void {
    // Handle XML response (multi-line with length header)
    if (this.waitingForXml) {
      this.xmlBuffer += this.buffer;
      this.buffer = '';

      if (this.xmlBuffer.length >= this.xmlLength) {
        const xmlData = this.xmlBuffer.substring(0, this.xmlLength);
        // Any remaining data goes back to the buffer
        this.buffer = this.xmlBuffer.substring(this.xmlLength);
        this.waitingForXml = false;
        this.xmlBuffer = '';
        this.parseXmlState(xmlData);
        // Continue processing remaining buffer
        if (this.buffer.length > 0) {
          this.processBuffer();
        }
      }
      return;
    }

    // Process complete lines
    while (this.buffer.includes('\r\n')) {
      const lineEnd = this.buffer.indexOf('\r\n');
      const line = this.buffer.substring(0, lineEnd);
      this.buffer = this.buffer.substring(lineEnd + 2);

      this.processLine(line);

      // If we entered XML waiting mode, stop line processing
      if (this.waitingForXml) {
        this.xmlBuffer = this.buffer;
        this.buffer = '';
        // Check if we already have enough data
        if (this.xmlBuffer.length >= this.xmlLength) {
          const xmlData = this.xmlBuffer.substring(0, this.xmlLength);
          this.buffer = this.xmlBuffer.substring(this.xmlLength);
          this.waitingForXml = false;
          this.xmlBuffer = '';
          this.parseXmlState(xmlData);
        }
        return;
      }
    }
  }

  private processLine(line: string): void {
    console.log(`[vMix] Received: ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);

    // TALLY response: "TALLY OK 12021..."
    if (line.startsWith('TALLY OK ')) {
      const tally = line.substring(9);
      this.processTally(tally);
    }
    // XML response header: "XML {length}"
    else if (line.startsWith('XML ')) {
      const length = parseInt(line.substring(4), 10);
      if (!isNaN(length) && length > 0) {
        this.waitingForXml = true;
        this.xmlLength = length;
        this.xmlBuffer = '';
      }
    }
  }

  private processTally(tally: string): void {
    const prevTally = this.tallyState;
    this.tallyState = tally;

    if (!prevTally) {
      // First tally - detect initial state
      for (let i = 0; i < tally.length; i++) {
        const inputNumber = i + 1;
        if (tally[i] === '1') {
          this.lastProgramInput = inputNumber;
        } else if (tally[i] === '2') {
          this.lastPreviewInput = inputNumber;
        }
      }
      console.log(`[vMix] Initial tally - Program: ${this.lastProgramInput}, Preview: ${this.lastPreviewInput}`);
      return;
    }

    // Compare with previous tally to detect changes
    // Important: In vMix, multiple inputs can have tally state '1' simultaneously
    // (e.g. main program + overlays). We only treat it as a program change if the
    // previous program input is no longer '1' (i.e. it actually switched away).
    // If the old program is still '1', the new '1' is just an overlay turning on.
    const maxLen = Math.max(tally.length, prevTally.length);
    let newProgram = this.lastProgramInput;
    let newPreview = this.lastPreviewInput;

    // Check if the previous program input is still on-air
    const prevProgramStillActive = this.lastProgramInput > 0 &&
      this.lastProgramInput <= tally.length &&
      tally[this.lastProgramInput - 1] === '1';

    for (let i = 0; i < maxLen; i++) {
      const prev = prevTally[i] || '0';
      const curr = tally[i] || '0';

      if (prev !== curr) {
        const inputNumber = i + 1;
        if (curr === '1') {
          // Only treat as program change if the old program input is no longer active.
          // If the old program is still '1', this new '1' is an overlay, not a cut.
          if (!prevProgramStillActive) {
            newProgram = inputNumber;
          } else {
            console.log(`[vMix] Input ${inputNumber} went on-air (overlay), ignoring as program change`);
          }
        } else if (curr === '2') {
          newPreview = inputNumber;
        } else if (curr === '0' && prev === '1' && inputNumber === this.lastProgramInput) {
          // The previous program input went off-air — find which input is now the program
          // by scanning for the input that is '1' and wasn't before (or is still '1')
          for (let j = 0; j < tally.length; j++) {
            if (tally[j] === '1' && j !== i) {
              newProgram = j + 1;
              break;
            }
          }
        }
      }
    }

    if (newProgram !== this.lastProgramInput) {
      this.lastProgramInput = newProgram;
      console.log(`[vMix] Program changed to input ${newProgram}`);
      this.emit('programChange', newProgram);
    }

    if (newPreview !== this.lastPreviewInput) {
      this.lastPreviewInput = newPreview;
      console.log(`[vMix] Preview changed to input ${newPreview}`);
      this.emit('previewChange', newPreview);
    }
  }

  private parseXmlState(xml: string): void {
    try {
      // Parse <active> tag for program input number
      // vMix XML uses 1-based input numbers in <active> and <preview>
      const activeMatch = xml.match(/<active>(\d+)<\/active>/);
      if (activeMatch) {
        const programInput = parseInt(activeMatch[1], 10);
        if (programInput !== this.lastProgramInput) {
          console.log(`[vMix] XML poll corrected program: ${this.lastProgramInput} → ${programInput}`);
          this.lastProgramInput = programInput;
          this.emit('programChange', programInput);
        }
      }

      // Parse <preview> tag for preview input number
      const previewMatch = xml.match(/<preview>(\d+)<\/preview>/);
      if (previewMatch) {
        const previewInput = parseInt(previewMatch[1], 10);
        if (previewInput !== this.lastPreviewInput) {
          console.log(`[vMix] XML poll corrected preview: ${this.lastPreviewInput} → ${previewInput}`);
          this.lastPreviewInput = previewInput;
          this.emit('previewChange', previewInput);
        }
      }
    } catch (error) {
      console.error(`[vMix] Failed to parse XML state:`, error);
    }
  }
}
