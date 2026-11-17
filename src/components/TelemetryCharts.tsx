import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MerchantOrder, TelemetryPoint, WebhookEventItem } from '../types';

interface TelemetryChartsProps {
  telemetry: TelemetryPoint[];
  order: MerchantOrder;
  webhookEvents: WebhookEventItem[];
  onLoadWebhookIntoLab: (ev: WebhookEventItem) => void;
}

export function TelemetryCharts({
  telemetry,
  order,
  webhookEvents,
  onLoadWebhookIntoLab,
}: TelemetryChartsProps) {
  return (
    <div className="space-y-8">
      {/* Recharts Dual Telemetry Band */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="border border-[#262626] bg-[#0d0d0d] p-6">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <div>
              <div className="font-machined text-[11px] tracking-[2px] uppercase text-[#999999]">
                Webhook Delivery Reliability
              </div>
              <h4 className="font-display mt-1 text-[22px] tracking-[1.5px] uppercase text-white">
                5xx Timeout Retries vs Signature Errors
              </h4>
            </div>
            <span className="font-machined text-[11px] tracking-[1.5px] uppercase text-[#cccccc]">
              24h Backoff Window
            </span>
          </div>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={telemetry}>
                <CartesianGrid stroke="#1f1f1f" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  stroke="#666666"
                  tick={{ fill: '#999999', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                />
                <YAxis
                  stroke="#666666"
                  tick={{ fill: '#999999', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#141414',
                    border: '1px solid #3a3a3a',
                    borderRadius: 0,
                    fontFamily: 'JetBrains Mono',
                    fontSize: '11px',
                    color: '#ffffff',
                  }}
                />
                <Bar dataKey="retryFailures5xx" name="5xx / Timeout Retries" fill="#d4a017" />
                <Bar dataKey="signatureErrors" name="Invalid HMAC / Replay" fill="#cf524c" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-[#262626] bg-[#0d0d0d] p-6">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <div>
              <div className="font-machined text-[11px] tracking-[2px] uppercase text-[#999999]">
                Endpoint Responsiveness
              </div>
              <h4 className="font-display mt-1 text-[22px] tracking-[1.5px] uppercase text-white">
                Webhook Ack Latency (ms)
              </h4>
            </div>
            <span className="font-machined text-[11px] tracking-[1.5px] uppercase text-[#c3d9f3]">
              SLA &lt; 500ms
            </span>
          </div>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={telemetry}>
                <CartesianGrid stroke="#1f1f1f" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  stroke="#666666"
                  tick={{ fill: '#999999', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                />
                <YAxis
                  stroke="#666666"
                  tick={{ fill: '#999999', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#141414',
                    border: '1px solid #3a3a3a',
                    borderRadius: 0,
                    fontFamily: 'JetBrains Mono',
                    fontSize: '11px',
                    color: '#ffffff',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="deliveryLatencyMs"
                  name="Endpoint Latency (ms)"
                  stroke="#c3d9f3"
                  fill="#c3d9f3"
                  fillOpacity={0.14}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Authoritative Gateway vs Merchant Order Reconciliation Diff */}
      <div className="border border-[#262626] bg-[#0d0d0d]">
        <div className="grid grid-cols-2 divide-x divide-[#262626] border-b border-[#262626] md:grid-cols-4">
          <div className="p-5">
            <div className="font-machined text-[10px] tracking-[2px] uppercase text-[#999999]">
              Merchant Order
            </div>
            <div className="font-display mt-1 text-[22px] tracking-[1.5px] uppercase text-white">
              {order.order_id}
            </div>
            <div className="font-machined mt-1 text-[11px] text-[#666666]">
              {order.customer_ref}
            </div>
          </div>
          <div className="p-5">
            <div className="font-machined text-[10px] tracking-[2px] uppercase text-[#999999]">
              Settlement Amount
            </div>
            <div className="font-machined mt-1 text-[20px] tabular-nums text-white">
              INR {(order.amount_paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="font-machined mt-1 text-[11px] text-[#666666]">
              {order.payment_id}
            </div>
          </div>
          <div className="p-5">
            <div className="font-machined text-[10px] tracking-[2px] uppercase text-[#999999]">
              Gateway Status
            </div>
            <div
              className={`font-display mt-1 text-[22px] tracking-[1.5px] uppercase ${
                order.gateway_status === 'captured' ? 'text-[#5fa657]' : 'text-[#cf524c]'
              }`}
            >
              {order.gateway_status}
            </div>
            <div className="font-machined mt-1 text-[11px] text-[#666666]">
              Razorpay Authoritative
            </div>
          </div>
          <div className="p-5">
            <div className="font-machined text-[10px] tracking-[2px] uppercase text-[#999999]">
              Merchant DB State
            </div>
            <div
              className={`font-display mt-1 text-[22px] tracking-[1.5px] uppercase ${
                order.order_status === 'RECONCILED' || order.order_status === 'PAID'
                  ? 'text-[#5fa657]'
                  : order.order_status === 'QUARANTINED'
                    ? 'text-[#cf524c]'
                    : 'text-[#d4a017]'
              }`}
            >
              {order.order_status}
            </div>
            <div className="font-machined mt-1 text-[11px] text-[#666666]">
              Last Event · {order.last_event_type}
            </div>
          </div>
        </div>

        {/* Raw Webhook Deliveries Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#262626] font-machined text-[10px] tracking-[2px] uppercase text-[#999999]">
                <th className="px-5 py-3 font-normal">Event ID</th>
                <th className="px-5 py-3 font-normal">Event Type</th>
                <th className="px-5 py-3 font-normal">HMAC Sig</th>
                <th className="px-5 py-3 font-normal">Replay / Order</th>
                <th className="px-5 py-3 font-normal">HTTP</th>
                <th className="px-5 py-3 font-normal">Source IP</th>
                <th className="px-5 py-3 font-normal text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262626] font-machined text-[12px]">
              {webhookEvents.map((ev) => (
                <tr key={ev.id} className="transition-colors hover:bg-[#141414]">
                  <td className="px-5 py-3.5 text-white">{ev.event_id}</td>
                  <td className="px-5 py-3.5 text-[#cccccc]">{ev.event_type}</td>
                  <td className="px-5 py-3.5">
                    <span className={ev.signature_valid ? 'text-[#5fa657]' : 'text-[#cf524c]'}>
                      {ev.signature_valid ? 'VALID' : 'INVALID'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[#cccccc]">
                    {ev.replay_detected
                      ? 'REPLAY_BLOCKED'
                      : ev.out_of_order
                        ? 'OUT_OF_ORDER'
                        : 'SEQUENTIAL'}
                  </td>
                  <td className="px-5 py-3.5 tabular-nums text-[#cccccc]">
                    {ev.http_status_returned} · Try #{ev.retry_attempt}
                  </td>
                  <td className="px-5 py-3.5 tabular-nums text-[#999999]">{ev.source_ip}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => onLoadWebhookIntoLab(ev)}
                      className="text-[11px] tracking-[1.5px] uppercase text-[#c3d9f3] underline underline-offset-4 hover:text-white"
                    >
                      Verify Payload
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
