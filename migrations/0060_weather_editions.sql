CREATE UNIQUE INDEX IF NOT EXISTS idx_weather_daily_edition
ON posts(original_link)
WHERE substr(original_link,1,length('https://diario.dopovo.com.br/tempo/'))='https://diario.dopovo.com.br/tempo/'
  AND instr(original_link,'?boletim=')>0;
