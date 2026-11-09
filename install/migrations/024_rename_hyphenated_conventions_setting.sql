UPDATE users
SET settings = (settings - 'hyphenatedConventions')
  || jsonb_build_object('hGroupConventions', settings -> 'hyphenatedConventions')
WHERE settings ? 'hyphenatedConventions';
