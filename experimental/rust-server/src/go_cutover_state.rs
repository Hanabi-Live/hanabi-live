//! Temporary storage operations for go_cutover.rs; remove after permanent Rust cutover.
use super::*;

const FINISH: &str = r"
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return -2 end
local count = (#KEYS - 3) / 2
local maximum = tonumber(redis.call('GET', KEYS[3]) or '0')
for i=1,count do
  local a = 2 + (i-1)*3
  if tonumber(redis.call('HGET', KEYS[2*i+2], 'revision')) ~= tonumber(ARGV[a]) then return -1 end
  if tonumber(redis.call('HGET', KEYS[2*i+3], 'revision')) ~= 1 then return -1 end
  if redis.call('SISMEMBER', KEYS[2], ARGV[a+1]) ~= 1 then return -3 end
  if redis.call('SISMEMBER', KEYS[2], 't:' .. ARGV[a+2]) ~= 1 then return -3 end
  maximum = math.max(maximum, tonumber(ARGV[a+2]))
end
for i=1,count do
  redis.call('DEL', KEYS[2*i+2])
  redis.call('SREM', KEYS[2], ARGV[3+(i-1)*3])
end
redis.call('SET', KEYS[3], string.format('%.0f', maximum))
return count
";

impl RedisState {
    pub(crate) async fn go_cutover_counter(&self) -> Result<u64> {
        self.check()?;
        let value: Option<u64> = redis::cmd("GET")
            .arg(format!("{}:table-counter", self.prefix))
            .query_async(&mut self.connection.clone())
            .await?;
        self.check()?;
        Ok(value.unwrap_or(0))
    }

    pub(crate) async fn finish_go_cutover(&self, records: &[(i32, i64, u64)]) -> Result<()> {
        self.check()?;
        ensure!(
            !records.is_empty() && records.len() <= 256,
            "Invalid Go cutover batch"
        );
        let script = Script::new(FINISH);
        let mut invocation = script.prepare_invoke();
        invocation
            .key(&self.owner.key)
            .key(self.index())
            .key(format!("{}:table-counter", self.prefix));
        for (game, _, table) in records {
            invocation
                .key(self.key(StateId::Game(*game))?)
                .key(self.key(StateId::Table(*table))?);
        }
        invocation.arg(&self.owner.token);
        for (game, revision, table) in records {
            invocation
                .arg(*revision)
                .arg(StateId::Game(*game).member()?)
                .arg(*table);
        }
        let mut connection = self.connection.clone();
        let result = invocation.invoke_async(&mut connection).await;
        ensure!(
            self.reply(result)? == records.len() as i64,
            "Incomplete Go cutover finalization"
        );
        self.acknowledge(&mut connection).await
    }
}
