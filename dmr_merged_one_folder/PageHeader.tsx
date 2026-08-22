type PageHeaderProps = {

  title: string;

  subtitle: string;

};

function PageHeader({

  title,

  subtitle,

}: PageHeaderProps) {

  return (

    <div>

      <h1 className="text-4xl font-bold text-slate-800">

        {title}

      </h1>

      <p className="text-slate-500 mt-2">

        {subtitle}

      </p>

    </div>

  );

}

export default PageHeader;